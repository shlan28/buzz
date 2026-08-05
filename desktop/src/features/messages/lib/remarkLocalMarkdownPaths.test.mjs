import assert from "node:assert/strict";
import test from "node:test";
import remarkLocalMarkdownPaths, {
  isLocalMarkdownPath,
} from "./remarkLocalMarkdownPaths.ts";

function parse(content) {
  const tree = {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "text", value: content }] },
    ],
  };
  remarkLocalMarkdownPaths()(tree);
  return tree;
}

function localPaths(tree) {
  const paths = [];
  const visit = (node) => {
    if (node.type === "local-markdown-path") paths.push(node.value);
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return paths;
}

test("recognizes Unix and Windows absolute Markdown paths", () => {
  assert.deepEqual(
    localPaths(
      parse("See /Users/lu/buzz/docs/plan.md and C:\\work\\README.MD."),
    ),
    ["/Users/lu/buzz/docs/plan.md", "C:\\work\\README.MD"],
  );
});

test("ignores relative paths, other extensions, links, and code", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "docs/plan.md /tmp/notes.txt" },
          {
            type: "link",
            url: "/tmp/link.md",
            children: [{ type: "text", value: "label" }],
          },
          { type: "inlineCode", value: "/tmp/inline.md" },
        ],
      },
      { type: "code", value: "/tmp/block.md" },
    ],
  };
  remarkLocalMarkdownPaths()(tree);
  assert.deepEqual(localPaths(tree), []);
});

test("whole-value classifier allows spaces for inline code", () => {
  assert.equal(isLocalMarkdownPath("/Users/lu/My Docs/plan.md"), true);
  assert.equal(isLocalMarkdownPath("C:\\My Docs\\plan.MD"), true);
  assert.equal(isLocalMarkdownPath("docs/plan.md"), false);
  assert.equal(isLocalMarkdownPath("/tmp/plan.mdx"), false);
});
