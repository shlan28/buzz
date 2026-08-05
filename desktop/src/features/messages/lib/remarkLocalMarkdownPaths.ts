import { createRemarkPrefixPlugin } from "../../../shared/lib/createRemarkPrefixPlugin.ts";

const LOCAL_MARKDOWN_PATH_PATTERN =
  /(?<![\w./\\-])(?:\/[^\s<>"'`]+?\.md|[A-Za-z]:\\[^\s<>"'`]+?\.md)(?=$|[\s),.;:!?}\]])/gi;

/** Return whether the whole value is a supported absolute Markdown path. */
export function isLocalMarkdownPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !/\.md$/i.test(trimmed)) return false;
  return trimmed.startsWith("/") || /^[A-Za-z]:\\/.test(trimmed);
}

/** Detect bare absolute `.md` paths in prose and expose custom HAST nodes. */
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
