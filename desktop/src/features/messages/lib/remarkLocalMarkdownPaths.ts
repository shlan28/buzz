import { createRemarkPrefixPlugin } from "../../../shared/lib/createRemarkPrefixPlugin.ts";

const LOCAL_MARKDOWN_PATH_PATTERN =
  /(?<![\w./\\:@-])(?!\.\.(?:[/\\]))(?:\/[^\s<>"'`]+?\.md|[A-Za-z]:\\[^\s<>"'`]+?\.md|~\/[^\s<>"'`]+?\.md|\.\/[^\s<>"'`]+?\.md|(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.md)(?=$|[\s),.;:!?}\]。、“”‘’《》（）【】])/gi;

/** Return whether the whole value is a supported local Markdown candidate. */
export function isLocalMarkdownPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !/\.md$/i.test(trimmed)) return false;
  if (trimmed.split(/[\\/]+/).includes("..")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || /^[A-Za-z]:\\/.test(trimmed);
}

/** Detect local `.md` path candidates in prose and expose custom HAST nodes. */
export default function remarkLocalMarkdownPaths() {
  return createRemarkPrefixPlugin(LOCAL_MARKDOWN_PATH_PATTERN, (path) => ({
    type: "local-markdown-path",
    value: path,
    data: {
      hName: "local-markdown-path",
      hProperties: { path },
      hChildren: [{ type: "text", value: path }],
    },
  }));
}
