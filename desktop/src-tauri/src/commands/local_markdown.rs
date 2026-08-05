use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

const MAX_MARKDOWN_PREVIEW_BYTES: u64 = 2 * 1024 * 1024;
const MAX_SEARCH_ENTRIES: usize = 10_000;
const MAX_SEARCH_MATCHES: usize = 20;
const MAX_SEARCH_DEPTH: usize = 8;
const SKIPPED_SEARCH_DIRS: &[&str] = &[".git", "node_modules", "target", "dist", "build"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMarkdownPreview {
    pub path: String,
    pub filename: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMarkdownCandidate {
    pub path: String,
    pub filename: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum LocalMarkdownLookup {
    Preview {
        preview: LocalMarkdownPreview,
    },
    Choices {
        matches: Vec<LocalMarkdownCandidate>,
    },
}

fn validate_markdown_path(path: &Path) -> Result<(), String> {
    let is_markdown = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
    if !is_markdown {
        return Err("Only .md files can be previewed".to_string());
    }
    Ok(())
}

fn validate_relative_candidate(path: &Path) -> Result<(), String> {
    validate_markdown_path(path)?;
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::RootDir))
    {
        return Err("Markdown path cannot leave the Agent workspace".to_string());
    }
    Ok(())
}

fn checked_candidate(path: &Path) -> Option<PathBuf> {
    let canonical = std::fs::canonicalize(path).ok()?;
    validate_markdown_path(&canonical).ok()?;
    let metadata = std::fs::metadata(&canonical).ok()?;
    (metadata.is_file() && metadata.len() <= MAX_MARKDOWN_PREVIEW_BYTES).then_some(canonical)
}

fn repository_roots(workspace: &Path) -> Vec<PathBuf> {
    let repos = workspace.join("REPOS");
    let Ok(repos_root) = std::fs::canonicalize(repos) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(repos_root) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            file_type.is_dir().then_some(entry.path())
        })
        .collect()
}

fn push_unique_match(path: PathBuf, matches: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>) {
    if matches.len() < MAX_SEARCH_MATCHES && seen.insert(path.clone()) {
        matches.push(path);
    }
}

fn search_filename(
    root: &Path,
    filename: &str,
    matches: &mut Vec<PathBuf>,
    seen: &mut HashSet<PathBuf>,
    visited: &mut usize,
) {
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((directory, depth)) = stack.pop() {
        if *visited >= MAX_SEARCH_ENTRIES || matches.len() >= MAX_SEARCH_MATCHES {
            break;
        }
        let Ok(entries) = std::fs::read_dir(directory) else {
            continue;
        };
        for entry in entries.flatten() {
            *visited += 1;
            if *visited >= MAX_SEARCH_ENTRIES || matches.len() >= MAX_SEARCH_MATCHES {
                break;
            }
            let name = entry.file_name();
            let file_type = match entry.file_type() {
                Ok(value) => value,
                Err(_) => continue,
            };
            if file_type.is_file() && name.to_string_lossy().eq_ignore_ascii_case(filename) {
                if let Some(candidate) = checked_candidate(&entry.path()) {
                    push_unique_match(candidate, matches, seen);
                }
            } else if file_type.is_dir()
                && depth < MAX_SEARCH_DEPTH
                && !SKIPPED_SEARCH_DIRS.contains(&name.to_string_lossy().as_ref())
            {
                stack.push((entry.path(), depth + 1));
            }
        }
    }
}

fn resolve_candidate_paths(
    candidate: &str,
    workspace: &Path,
    home: &Path,
) -> Result<Vec<PathBuf>, String> {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return Err("Markdown path is empty".to_string());
    }
    let candidate_path = Path::new(trimmed);
    validate_markdown_path(candidate_path)?;

    if candidate_path.is_absolute() {
        return checked_candidate(candidate_path)
            .map(|path| vec![path])
            .ok_or_else(|| "Could not find a readable Markdown file at that path".to_string());
    }
    if let Some(home_relative) = trimmed.strip_prefix("~/") {
        let relative = Path::new(home_relative);
        validate_relative_candidate(relative)?;
        return checked_candidate(&home.join(relative))
            .map(|path| vec![path])
            .ok_or_else(|| "Could not find a readable Markdown file at that path".to_string());
    }

    validate_relative_candidate(candidate_path)?;
    let normalized = candidate_path.strip_prefix(".").unwrap_or(candidate_path);
    let mut roots = vec![workspace.to_path_buf()];
    roots.extend(repository_roots(workspace));
    let mut matches = Vec::new();
    let mut seen = HashSet::new();

    if normalized.components().count() > 1 {
        for root in roots {
            if let Some(path) = checked_candidate(&root.join(normalized)) {
                push_unique_match(path, &mut matches, &mut seen);
            }
        }
    } else {
        let filename = normalized
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "Markdown file name is not valid UTF-8".to_string())?;
        let mut visited = 0usize;
        for root in roots {
            search_filename(&root, filename, &mut matches, &mut seen, &mut visited);
            if visited >= MAX_SEARCH_ENTRIES || matches.len() >= MAX_SEARCH_MATCHES {
                break;
            }
        }
    }
    matches.sort();
    if matches.is_empty() {
        return Err("No matching Markdown file was found in the Agent workspace".to_string());
    }
    Ok(matches)
}

async fn read_preview(path: PathBuf) -> Result<LocalMarkdownPreview, String> {
    if !path.is_absolute() {
        return Err("Only resolved Markdown file paths can be previewed".to_string());
    }
    validate_markdown_path(&path)?;
    let canonical_path = tokio::fs::canonicalize(&path)
        .await
        .map_err(|error| format!("Could not resolve Markdown file path: {error}"))?;
    validate_markdown_path(&canonical_path)?;
    let metadata = tokio::fs::metadata(&canonical_path)
        .await
        .map_err(|error| format!("Could not open Markdown file: {error}"))?;
    if !metadata.is_file() {
        return Err("The selected path is not a regular file".to_string());
    }
    if metadata.len() > MAX_MARKDOWN_PREVIEW_BYTES {
        return Err("Markdown file is too large to preview (maximum 2 MiB)".to_string());
    }
    let content = tokio::fs::read_to_string(&canonical_path)
        .await
        .map_err(|error| format!("Could not read Markdown file as UTF-8: {error}"))?;
    let filename = canonical_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Markdown file name is not valid UTF-8".to_string())?
        .to_string();

    Ok(LocalMarkdownPreview {
        path: canonical_path.to_string_lossy().into_owned(),
        filename,
        content,
    })
}

#[tauri::command]
pub async fn read_local_markdown_preview(path: String) -> Result<LocalMarkdownLookup, String> {
    let workspace = crate::managed_agents::default_agent_workdir()
        .ok_or_else(|| "Agent workspace is unavailable".to_string())?;
    let home = dirs::home_dir().ok_or_else(|| "User home directory is unavailable".to_string())?;
    let candidate = path.clone();
    let paths =
        tokio::task::spawn_blocking(move || resolve_candidate_paths(&candidate, &workspace, &home))
            .await
            .map_err(|error| format!("Markdown path search failed: {error}"))??;

    if paths.len() == 1 {
        return Ok(LocalMarkdownLookup::Preview {
            preview: read_preview(
                paths
                    .into_iter()
                    .next()
                    .ok_or_else(|| "Markdown path search returned no result".to_string())?,
            )
            .await?,
        });
    }
    Ok(LocalMarkdownLookup::Choices {
        matches: paths
            .into_iter()
            .filter_map(|path| {
                let filename = path.file_name()?.to_str()?.to_string();
                Some(LocalMarkdownCandidate {
                    path: path.to_string_lossy().into_owned(),
                    filename,
                })
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reads_utf8_markdown() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("plan.md");
        std::fs::write(&path, "# Plan\n").expect("write fixture");

        let preview = read_preview(path.clone()).await.expect("preview");
        assert_eq!(preview.filename, "plan.md");
        assert_eq!(preview.content, "# Plan\n");
        assert_eq!(
            PathBuf::from(preview.path),
            path.canonicalize().expect("canonical")
        );
    }

    #[test]
    fn resolves_workspace_repo_home_and_multiple_matches() {
        let workspace = tempfile::tempdir().expect("workspace");
        let home = tempfile::tempdir().expect("home");
        std::fs::create_dir_all(workspace.path().join("docs")).expect("workspace docs");
        std::fs::write(workspace.path().join("docs/plan.md"), "workspace").expect("workspace file");
        std::fs::create_dir_all(workspace.path().join("REPOS/one/docs")).expect("repo one");
        std::fs::create_dir_all(workspace.path().join("REPOS/two")).expect("repo two");
        std::fs::write(workspace.path().join("REPOS/one/docs/plan.md"), "repo").expect("repo file");
        std::fs::write(workspace.path().join("REPOS/two/README.md"), "two").expect("readme two");
        std::fs::write(workspace.path().join("README.md"), "workspace").expect("readme workspace");
        std::fs::write(home.path().join("notes.md"), "home").expect("home file");

        assert_eq!(
            resolve_candidate_paths("docs/plan.md", workspace.path(), home.path())
                .expect("relative")
                .len(),
            2
        );
        assert_eq!(
            resolve_candidate_paths("README.md", workspace.path(), home.path())
                .expect("filename")
                .len(),
            2
        );
        assert_eq!(
            resolve_candidate_paths("~/notes.md", workspace.path(), home.path())
                .expect("home")
                .len(),
            1
        );
    }

    #[test]
    fn rejects_parent_traversal_and_missing_files() {
        let workspace = tempfile::tempdir().expect("workspace");
        let home = tempfile::tempdir().expect("home");
        assert!(resolve_candidate_paths("../secret.md", workspace.path(), home.path()).is_err());
        assert!(resolve_candidate_paths("missing.md", workspace.path(), home.path()).is_err());
    }

    #[test]
    fn caps_ambiguous_filename_matches() {
        let workspace = tempfile::tempdir().expect("workspace");
        let home = tempfile::tempdir().expect("home");
        for index in 0..(MAX_SEARCH_MATCHES + 5) {
            let directory = workspace.path().join(format!("folder-{index}"));
            std::fs::create_dir(&directory).expect("fixture directory");
            std::fs::write(directory.join("result.md"), index.to_string()).expect("fixture file");
        }

        let matches =
            resolve_candidate_paths("result.md", workspace.path(), home.path()).expect("matches");
        assert_eq!(matches.len(), MAX_SEARCH_MATCHES);
    }

    #[tokio::test]
    async fn rejects_invalid_utf8_and_oversized_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        let invalid = dir.path().join("invalid.md");
        std::fs::write(&invalid, [0xff, 0xfe]).expect("write invalid fixture");
        assert!(read_preview(invalid).await.is_err());

        let large = dir.path().join("large.md");
        let file = std::fs::File::create(&large).expect("create large fixture");
        file.set_len(MAX_MARKDOWN_PREVIEW_BYTES + 1)
            .expect("size large fixture");
        assert!(read_preview(large).await.is_err());
    }
}
