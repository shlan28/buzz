use std::path::{Path, PathBuf};

use serde::Serialize;

const MAX_MARKDOWN_PREVIEW_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMarkdownPreview {
    pub path: String,
    pub filename: String,
    pub content: String,
}

fn validate_markdown_path(path: &Path) -> Result<(), String> {
    if !path.is_absolute() {
        return Err("Only absolute Markdown file paths can be previewed".to_string());
    }
    let is_markdown = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
    if !is_markdown {
        return Err("Only .md files can be previewed".to_string());
    }
    Ok(())
}

async fn read_preview(path: PathBuf) -> Result<LocalMarkdownPreview, String> {
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
pub async fn read_local_markdown_preview(path: String) -> Result<LocalMarkdownPreview, String> {
    read_preview(PathBuf::from(path)).await
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

    #[tokio::test]
    async fn rejects_relative_non_markdown_directory_and_oversized_files() {
        assert!(read_preview(PathBuf::from("plan.md")).await.is_err());

        let dir = tempfile::tempdir().expect("tempdir");
        let text = dir.path().join("plan.txt");
        std::fs::write(&text, "text").expect("write text fixture");
        assert!(read_preview(text).await.is_err());

        let markdown_dir = dir.path().join("folder.md");
        std::fs::create_dir(&markdown_dir).expect("create fixture directory");
        assert!(read_preview(markdown_dir).await.is_err());

        let large = dir.path().join("large.md");
        let file = std::fs::File::create(&large).expect("create large fixture");
        file.set_len(MAX_MARKDOWN_PREVIEW_BYTES + 1)
            .expect("size large fixture");
        assert!(read_preview(large).await.is_err());
    }

    #[tokio::test]
    async fn rejects_invalid_utf8() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("invalid.md");
        std::fs::write(&path, [0xff, 0xfe]).expect("write invalid fixture");
        assert!(read_preview(path).await.is_err());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_markdown_symlink_to_non_markdown_target() {
        use std::os::unix::fs::symlink;

        let dir = tempfile::tempdir().expect("tempdir");
        let target = dir.path().join("secret.txt");
        let link = dir.path().join("looks-safe.md");
        std::fs::write(&target, "secret").expect("write target");
        symlink(&target, &link).expect("create symlink");

        assert!(read_preview(link).await.is_err());
    }
}
