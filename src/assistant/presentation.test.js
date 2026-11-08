import test from "node:test";
import assert from "node:assert/strict";
import { draftBadge, groupHistory, previewText, taskBadge } from "./presentation.js";
import { hashForView, resolveRoute, resolveView, VIEWS } from "../route.js";

const TODAY = "2026-11-05";
const utcDay = (iso) => iso.slice(0, 10); // deterministic stand-in for the viewer's local date
const task = (id, over = {}) => ({
  id, title: `Task ${id}`, owner: { kind: "unassigned", name: "" }, dueDate: null, status: "open", completedAt: null,
  createdAt: "2026-11-01T10:00:00.000Z", messageDate: "2026-11-01", sourceSnippet: "", dateExpression: null, extractorId: "x", ...over,
});

test("saved-task badges say what they mean in words, not just colour", () => {
  const badge = (over) => taskBadge(task("t", over), TODAY, utcDay);
  assert.deepEqual(badge({ dueDate: "2026-11-03" }), { tone: "danger", label: "Overdue by 2 days" });
  assert.deepEqual(badge({ dueDate: "2026-11-04" }), { tone: "danger", label: "Overdue by 1 day" });
  assert.deepEqual(badge({ dueDate: TODAY }), { tone: "warn", label: "Due today" });
  assert.deepEqual(badge({ dueDate: "2026-11-06" }), { tone: "warn", label: "Due tomorrow" });
  assert.deepEqual(badge({ dueDate: "2026-11-20" }), { tone: "info", label: "Due Fri 20 Nov 2026" });
  assert.deepEqual(badge({}), { tone: "neutral", label: "No deadline" });
  assert.deepEqual(badge({ status: "done", completedAt: "2026-11-04T09:00:00.000Z", dueDate: "2026-10-01" }), { tone: "ok", label: "Completed Wed 4 Nov 2026" });
  assert.deepEqual(badge({ status: "done", completedAt: null }), { tone: "ok", label: "Completed" });
});

test("draft badges flag ambiguity and show where a deadline came from", () => {
  assert.deepEqual(draftBadge({ dateStatus: "ambiguous" }), { tone: "warn", label: "Check deadline" });
  assert.deepEqual(draftBadge({ dateStatus: "resolved", dateExpression: "this Friday" }), { tone: "ok", label: "From “this Friday”" });
  assert.deepEqual(draftBadge({ dateStatus: "confirmed" }), { tone: "info", label: "Set by you" });
  assert.deepEqual(draftBadge({ dateStatus: "none", dateExpression: null }), { tone: "neutral", label: "No deadline found" });
  assert.deepEqual(draftBadge({ dateStatus: "none", dateExpression: "next week" }), { tone: "neutral", label: "No deadline (removed)" });
});

test("history groups saved tasks by day, newest first, using only stored task data", () => {
  const tasks = [
    task("a", { createdAt: "2026-11-01T08:00:00.000Z" }), task("b", { createdAt: "2026-11-03T08:00:00.000Z" }),
    task("c", { createdAt: "2026-11-01T18:00:00.000Z" }), task("d", { createdAt: "garbage" }),
  ];
  const groups = groupHistory(tasks, { toLocalDate: (iso) => (Number.isNaN(Date.parse(iso)) ? "" : utcDay(iso)) });
  assert.deepEqual(groups.map((g) => g.date), ["unknown", "2026-11-03", "2026-11-01"].sort().reverse());
  assert.deepEqual(groups.find((g) => g.date === "2026-11-01").tasks.map((t) => t.id), ["c", "a"], "newest first inside a day");
  assert.deepEqual(groupHistory([]), []);
  const original = structuredClone(tasks);
  groupHistory(tasks);
  assert.deepEqual(tasks, original, "input is not mutated");
});

test("previews collapse whitespace and are shortened with an ellipsis", () => {
  assert.equal(previewText("  a\n  b   c "), "a b c");
  assert.equal(previewText("x".repeat(100), 10), "xxxxxxxxx…");
  assert.equal(previewText(null), "");
});

test("the four sections have stable hashes and unknown hashes fall back to Extract & Review", () => {
  assert.deepEqual(VIEWS.map((v) => v.label), ["Extract & Review", "My Tasks", "Local History", "Settings"]);
  assert.deepEqual(["", "#/", "#/tasks", "#/history", "#/settings", "#/nope", "#/EXTRACT", "#tasks", "#/Tasks?x=1"].map(resolveView),
    ["extract", "extract", "tasks", "history", "settings", "extract", "extract", "tasks", "tasks"]);
  for (const view of VIEWS) assert.equal(resolveView(hashForView(view.id)), view.id);
  assert.equal(hashForView("unknown"), "#/");
  for (const hash of ["#/tasks", "#/history", "#/settings"]) assert.equal(resolveRoute(hash), "assistant", "section hashes never open the school demo");
  assert.equal(resolveRoute("#/school-demo"), "school-demo");
  assert.equal(resolveView("#/school-demo"), "extract");
});
