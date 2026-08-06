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

test("ignores other extensions, links, and code", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "/tmp/notes.txt" },
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
  assert.equal(isLocalMarkdownPath("docs/plan.md"), true);
  assert.equal(isLocalMarkdownPath("README.md"), true);
  assert.equal(isLocalMarkdownPath("~/notes/plan.md"), true);
  assert.equal(isLocalMarkdownPath("../secret.md"), false);
  assert.equal(isLocalMarkdownPath("/tmp/plan.mdx"), false);
});

test("detects relative and home Markdown candidates in prose", () => {
  assert.deepEqual(
    localPaths(
      parse(
        "Review README.md, docs/plan.md, ./notes/todo.md and ~/work/result.md.",
      ),
    ),
    ["README.md", "docs/plan.md", "./notes/todo.md", "~/work/result.md"],
  );
});

test("keeps Chinese sentence punctuation outside Markdown paths", () => {
  assert.deepEqual(
    localPaths(
      parse(
        "报告：RESEARCH/REPORT.md。下一份：OUTBOX/NEXT.md、最后：PLANS/LAST.md",
      ),
    ),
    ["RESEARCH/REPORT.md", "OUTBOX/NEXT.md", "PLANS/LAST.md"],
  );
});

test("recognizes Markdown paths wrapped in Chinese punctuation", () => {
  assert.deepEqual(
    localPaths(
      parse(
        "请看“RESEARCH/QUOTED.md”、‘OUTBOX/SINGLE.md’、《PLANS/BOOK.md》、（GUIDES/PAREN.md）和【WORK_LOGS/BRACKET.md】",
      ),
    ),
    [
      "RESEARCH/QUOTED.md",
      "OUTBOX/SINGLE.md",
      "PLANS/BOOK.md",
      "GUIDES/PAREN.md",
      "WORK_LOGS/BRACKET.md",
    ],
  );
});

test("does not detect parent traversal or URL Markdown paths", () => {
  assert.deepEqual(
    localPaths(parse("Skip ../secret.md and https://example.com/readme.md.")),
    [],
  );
});
