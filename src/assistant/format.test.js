import test from "node:test";
import assert from "node:assert/strict";
import { escapeMarkdown, toMarkdown, toPlainText } from "./format.js";

const TODAY = "2026-11-05";
const task = (id, over = {}) => ({
  id, title: `Task ${id}`, owner: { kind: "unassigned", name: "" }, dueDate: null, status: "open", completedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z", messageDate: "2026-11-01", sourceSnippet: "", dateExpression: null, extractorId: "x", ...over,
});
const sample = [
  task("late", { title: "Pay the fee", dueDate: "2026-11-03", owner: { kind: "me", name: "" } }),
  task("soon", { title: "Send slides", dueDate: "2026-11-06", owner: { kind: "other", name: "Sarah" }, sourceSnippet: "Sarah to send slides by Friday." }),
  task("none", { title: "Book venue" }),
  task("done", { title: "Return form", status: "done", completedAt: "2026-11-04T00:00:00.000Z", dueDate: "2026-11-02" }),
];

test("Markdown groups tasks and shows owners and dates", () => {
  assert.equal(toMarkdown(sample, { today: TODAY }), [
    "# Tasks", "", "## Overdue", "- [ ] Pay the fee (Owner: Me; Due: Tue 3 Nov 2026 (overdue))", "",
    "## Upcoming", "- [ ] Send slides (Owner: Sarah; Due: Fri 6 Nov 2026)", "", "## No deadline", "- [ ] Book venue", "",
  ].join("\n"));
});

test("plain text mirrors the same content without Markdown syntax", () => {
  assert.equal(toPlainText(sample, { today: TODAY }), [
    "TASKS", "", "OVERDUE", "- [ ] Pay the fee (Owner: Me; Due: Tue 3 Nov 2026 (overdue))", "",
    "UPCOMING", "- [ ] Send slides (Owner: Sarah; Due: Fri 6 Nov 2026)", "", "NO DEADLINE", "- [ ] Book venue", "",
  ].join("\n"));
});

test("completed tasks and source text are opt-in", () => {
  const md = toMarkdown(sample, { today: TODAY, includeCompleted: true, includeSource: true });
  assert.match(md, /## Completed\n- \[x\] Return form \(Due: Mon 2 Nov 2026\)/);
  assert.match(md, /  > Sarah to send slides by Friday\./);
  const plain = toPlainText(sample, { today: TODAY, includeCompleted: true, includeSource: true });
  assert.match(plain, /COMPLETED\n- \[x\] Return form/);
  assert.match(plain, /    Source: Sarah to send slides by Friday\./);
  assert.doesNotMatch(toMarkdown(sample, { today: TODAY }), /Completed|Return form/);
});

test("an empty list says so", () => {
  assert.equal(toMarkdown([], { today: TODAY }), "# Tasks\n\nNo tasks.\n");
  assert.equal(toPlainText([], { today: TODAY }), "TASKS\n\nNo tasks.\n");
  assert.equal(toMarkdown([sample[3]], { today: TODAY }), "# Tasks\n\nNo tasks.\n", "only completed tasks and they are excluded");
});

test("pasted text cannot become links, images, HTML, headings or extra list items in Markdown", () => {
  const hostile = [
    "[click me](javascript:alert(1))", "![tracker](https://evil.example/p.png)", "<img src=x onerror=alert(1)>", "# Injected heading",
    "line one\n- [ ] injected second task\n## fake section", "`code` and *bold* and _em_ and ~~strike~~", "[ref]: https://evil.example",
    "https://evil.example/phish", "www.evil.example/phish", "javascript:alert(1)", "a | b | c", "1. fake numbered", "> quote", "&lt;script&gt; & &amp;", "\u2028- [ ] separator injection",
  ].map((title, i) => task(`h${i}`, { title, sourceSnippet: title, owner: { kind: "other", name: title } }));
  const md = toMarkdown(hostile, { today: TODAY, includeSource: true });
  const lines = md.split("\n");
  assert.equal(lines.filter((l) => /^- \[ \] /.test(l)).length, hostile.length, "exactly one list item per task");
  assert.deepEqual(lines.filter((l) => /^#{1,6} /.test(l)), ["# Tasks", "## No deadline"], "no injected headings");
  assert.equal(lines.filter((l) => /^## /.test(l)).length, 1);
  assert.doesNotMatch(md, /(^|[^\\])<[a-z\/!?]/i, "no unescaped HTML tags");
  assert.doesNotMatch(md, /(^|[^\\\w])www\./i, "no auto-linkable www. addresses");
  assert.doesNotMatch(md, /(^|[^\\])\[[^\]]*\]\(/, "no live Markdown links or images");
  assert.doesNotMatch(md, /(?<![\\\w])(?:https?|javascript|data|file|ftp|vbscript):/i, "no unescaped URL schemes");
  assert.ok(!md.includes("\u2028"));
});

test("escaping is applied consistently and leaves ordinary text readable", () => {
  assert.equal(escapeMarkdown("Pay the $18 fee (before Friday)"), "Pay the $18 fee (before Friday)");
  assert.equal(escapeMarkdown("a  b\n c"), "a b c");
  assert.equal(escapeMarkdown("*x* _y_ [z] <w>"), "\\*x\\* \\_y\\_ \\[z\\] \\<w\\>");
  assert.equal(escapeMarkdown("# hi"), "\\# hi");
  assert.equal(escapeMarkdown("- hi"), "\\- hi");
  assert.equal(escapeMarkdown(null), "");
});

test("plain text flattens newlines and control characters in every field", () => {
  const out = toPlainText([task("p", { title: "one\n- [ ] injected\u0000\u0007 two", owner: { kind: "other", name: "A\nB" } })], { today: TODAY });
  const items = out.split("\n").filter((l) => l.startsWith("- [ ] "));
  assert.equal(items.length, 1);
  assert.equal(items[0], "- [ ] one - [ ] injected two (Owner: A B)");
});
