import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_MESSAGE, createDemoExtractor, extractTasksFromText, normalizeExtraction } from "./extractor.js";
import {
  MAX_STORED_TASKS, assignToMe, classifyTasks, confirmDrafts, confirmationProblems, draftProblems, dueInDays, editDraft,
  mergeTasks, parseOwnerInput, removeTask, sanitizeStoredTask, setTaskStatus,
} from "./taskModel.js";

const WED = "2026-11-04";
async function drafts(text = SAMPLE_MESSAGE) {
  const extractor = createDemoExtractor();
  return normalizeExtraction(await extractor.extract({ text, receivedDate: WED }), { text, receivedDate: WED, extractor }).drafts;
}
const ids = () => { let n = 0; return () => `id-${++n}`; };
const task = (over = {}) => ({
  id: "t", title: "T", owner: { kind: "unassigned", name: "" }, dueDate: null, status: "open", completedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z", messageDate: WED, sourceSnippet: "", dateExpression: null, extractorId: "x", ...over,
});

test("owner text is interpreted: me, another person, or nobody", () => {
  for (const me of ["me", "Me", " ME ", "myself"]) assert.deepEqual(parseOwnerInput(me), { kind: "me", name: "" }, me);
  for (const name of ["I", "Ian", "Mei Ling", "Me Lee", "Meera"]) assert.deepEqual(parseOwnerInput(name), { kind: "other", name }, `${name} is a person`);
  assert.deepEqual(parseOwnerInput("Sarah Lim"), { kind: "other", name: "Sarah Lim" });
  assert.deepEqual(parseOwnerInput("  Sarah\n  Lim  "), { kind: "other", name: "Sarah Lim" });
  assert.deepEqual(parseOwnerInput(""), { kind: "unassigned", name: "" });
  assert.deepEqual(parseOwnerInput("   "), { kind: "unassigned", name: "" });
  assert.deepEqual(parseOwnerInput(undefined), { kind: "unassigned", name: "" });
  assert.equal(parseOwnerInput("x".repeat(500)).name.length, 80);
});

test("editing a draft changes title, owner and deadline without mutating the original", async () => {
  const [original] = await drafts("Please bring a hat.");
  const snapshot = structuredClone(original);
  const edited = editDraft(editDraft(editDraft(original, { title: "  Bring a  sun hat \n" }), { ownerText: "Sarah" }), { dueDate: "2026-11-20" });
  assert.equal(edited.title, "  Bring a  sun hat  ", "typing is preserved as entered, so spaces can be typed");
  assert.equal(editDraft(original, { title: "Bring " }).title, "Bring ", "a trailing space survives while the user keeps typing");
  assert.equal(confirmDrafts([edited])[0].title, "Bring a sun hat", "it is tidied when the task is confirmed");
  assert.deepEqual(edited.owner, { kind: "other", name: "Sarah" });
  assert.deepEqual([edited.dueDate, edited.dateStatus], ["2026-11-20", "confirmed"]);
  assert.deepEqual(original, snapshot, "the original draft is untouched");
  assert.equal(editDraft(original, { title: "x".repeat(900) }).title.length, 200);
  assert.equal(editDraft(original, { title: "a\u0000b\u0007c" }).title, "abc");
  assert.equal(editDraft(original, { title: "line\nbreak" }).title, "line break");
  assert.equal(editDraft(original, { title: 42 }).title, "");
});

test("assign-to-me sets the owner to the user and can be reversed by editing", async () => {
  const [d] = await drafts("Sarah to send the slides.");
  assert.deepEqual(d.owner, { kind: "other", name: "Sarah" });
  const mine = assignToMe(d);
  assert.deepEqual(mine.owner, { kind: "me", name: "" });
  assert.deepEqual(editDraft(mine, { ownerText: "" }).owner, { kind: "unassigned", name: "" });
  assert.deepEqual(editDraft(mine, { ownerText: "Priya" }).owner, { kind: "other", name: "Priya" });
});

test("ambiguous deadlines block saving until the user decides", async () => {
  const [d] = await drafts("Please pay the fee next Friday.");
  assert.equal(d.dateStatus, "ambiguous");
  assert.deepEqual(draftProblems(d), ["Choose a deadline or select “No deadline”."]);
  assert.equal(confirmationProblems([d]).length, 1);
  const picked = editDraft(d, { dueDate: d.dateCandidates[1] });
  assert.deepEqual([picked.dueDate, picked.dateStatus], ["2026-11-13", "confirmed"]);
  assert.deepEqual(confirmationProblems([picked]), []);
  const none = editDraft(d, { dueDate: null });
  assert.deepEqual([none.dueDate, none.dateStatus, none.dateCandidates], [null, "none", []]);
  assert.deepEqual(confirmationProblems([none]), []);
  assert.equal(editDraft(d, { dueDate: "not-a-date" }).dateStatus, "ambiguous", "invalid input does not resolve the ambiguity");
  assert.equal(editDraft(d, { dueDate: "2026-02-30" }).dateStatus, "ambiguous");
});

test("an empty title or an empty list cannot be confirmed", async () => {
  const [d] = await drafts("Please bring a hat.");
  assert.match(confirmationProblems([editDraft(d, { title: "   " })])[0], /Task 1: Add a title/);
  assert.deepEqual(confirmationProblems([]), ["There are no tasks to save."]);
  assert.throws(() => confirmDrafts([]), /no tasks/);
  assert.throws(() => confirmDrafts([editDraft(d, { title: "" })]), /title/);
});

test("confirmed tasks keep reviewed values and only a short excerpt, never the whole message", async () => {
  const message = `${SAMPLE_MESSAGE}\nPrivate: my NRIC is S1234567A and my address is 1 Example Road.`;
  const all = await drafts(message);
  const fee = all.find((d) => d.title.startsWith("Pay"));
  const reviewed = [editDraft(fee, { dueDate: "2026-11-13" }), assignToMe(all[0])];
  const saved = confirmDrafts(reviewed, { now: new Date("2026-11-04T01:00:00Z"), messageDate: WED, extractorId: "demo-rules-v1", idFactory: ids() });
  assert.deepEqual(saved.map((t) => t.id), ["id-1", "id-2"]);
  assert.deepEqual(saved[0], {
    id: "id-1", title: "Pay the $18 workshop fee", owner: { kind: "unassigned", name: "" }, dueDate: "2026-11-13", status: "open", completedAt: null,
    createdAt: "2026-11-04T01:00:00.000Z", messageDate: WED, sourceSnippet: "Don't forget to pay the $18 workshop fee next Friday.",
    dateExpression: "next Friday", extractorId: "demo-rules-v1",
  });
  assert.deepEqual(saved[1].owner, { kind: "me", name: "" });
  const serialised = JSON.stringify(saved);
  assert.ok(!serialised.includes("NRIC") && !serialised.includes("Example Road"), "text outside the task excerpts is not retained");
  assert.ok(!serialised.includes(SAMPLE_MESSAGE.split("\n")[0]), "the greeting line is not retained");
  for (const t of saved) assert.ok(t.sourceSnippet.length <= 400);
});

test("saving without source text keeps nothing from the message", async () => {
  const all = await drafts();
  const saved = confirmDrafts(all.filter((d) => d.dateStatus !== "ambiguous"), { keepSnippets: false, messageDate: WED, extractorId: "demo-rules-v1", idFactory: ids() });
  assert.ok(saved.length > 0);
  for (const t of saved) assert.deepEqual([t.sourceSnippet, t.dateExpression], ["", null]);
});

test("task status can be toggled between open and done", () => {
  const tasks = [task({ id: "a" }), task({ id: "b" })];
  const done = setTaskStatus(tasks, "a", "done", new Date("2026-11-05T09:00:00Z"));
  assert.deepEqual([done[0].status, done[0].completedAt, done[1].status], ["done", "2026-11-05T09:00:00.000Z", "open"]);
  const reopened = setTaskStatus(done, "a", "open");
  assert.deepEqual([reopened[0].status, reopened[0].completedAt], ["open", null]);
  assert.equal(tasks[0].status, "open", "input is not mutated");
  assert.strictEqual(setTaskStatus(tasks, "a", "archived"), tasks, "unknown status ignored");
  assert.deepEqual(setTaskStatus(tasks, "missing", "done"), tasks);
  assert.deepEqual(removeTask(tasks, "a").map((t) => t.id), ["b"]);
});

test("tasks are grouped into overdue, upcoming, undated and completed", () => {
  const today = "2026-11-05";
  const tasks = [
    task({ id: "late2", dueDate: "2026-11-03" }), task({ id: "late1", dueDate: "2026-10-30" }), task({ id: "today", dueDate: today }),
    task({ id: "soon", dueDate: "2026-11-06" }), task({ id: "later", dueDate: "2027-01-01" }), task({ id: "nodate1", createdAt: "2026-11-01T00:00:00.000Z" }),
    task({ id: "nodate2", createdAt: "2026-11-02T00:00:00.000Z" }),
    task({ id: "doneOld", status: "done", dueDate: "2026-10-01", completedAt: "2026-10-02T00:00:00.000Z" }),
    task({ id: "doneNew", status: "done", completedAt: "2026-11-04T00:00:00.000Z" }),
  ];
  const g = classifyTasks(tasks, today);
  assert.deepEqual(g.overdue.map((t) => t.id), ["late1", "late2"]);
  assert.deepEqual(g.upcoming.map((t) => t.id), ["today", "soon", "later"], "due today is upcoming, not overdue");
  assert.deepEqual(g.undated.map((t) => t.id), ["nodate1", "nodate2"]);
  assert.deepEqual(g.completed.map((t) => t.id), ["doneNew", "doneOld"], "completed tasks are never overdue");
  assert.equal(dueInDays(task({ dueDate: "2026-11-08" }), today), 3);
  assert.equal(dueInDays(task({ dueDate: "2026-11-03" }), today), -2);
  assert.equal(dueInDays(task(), today), null);
});

test("saving the same tasks twice does not create duplicates, and the store is capped", () => {
  const a = task({ id: "a", title: "Pay fee", dueDate: "2026-11-13", owner: { kind: "me", name: "" } });
  const again = task({ id: "b", title: "pay FEE", dueDate: "2026-11-13", owner: { kind: "me", name: "" } });
  const merged = mergeTasks([a], [again, task({ id: "c", title: "Other" })]);
  assert.deepEqual([merged.added, merged.skippedDuplicates, merged.tasks.map((t) => t.id)], [1, 1, ["a", "c"]]);
  const finished = mergeTasks([{ ...a, status: "done" }], [again]);
  assert.equal(finished.added, 1, "a completed task does not block adding it again");
  const full = Array.from({ length: MAX_STORED_TASKS }, (_, i) => task({ id: `x${i}`, title: `T${i}` }));
  const capped = mergeTasks(full, [task({ id: "new", title: "New" })]);
  assert.deepEqual([capped.added, capped.rejectedForLimit, capped.tasks.length], [0, 1, MAX_STORED_TASKS]);
});

test("stored tasks are rebuilt from known, validated fields only", () => {
  assert.equal(sanitizeStoredTask(null), null);
  assert.equal(sanitizeStoredTask({ id: "x", title: "" }), null);
  assert.equal(sanitizeStoredTask({ title: "No id" }), null);
  const cleaned = sanitizeStoredTask({
    id: "x", title: "Hello\u0000", owner: { kind: "admin", name: "root" }, dueDate: "2026-02-31", status: "weird", completedAt: "2026-11-05T00:00:00Z",
    createdAt: "garbage", extraField: "<script>", __proto__: { polluted: true }, sourceSnippet: 5,
  });
  assert.deepEqual(cleaned.owner, { kind: "unassigned", name: "" });
  assert.deepEqual([cleaned.title, cleaned.dueDate, cleaned.status, cleaned.completedAt, cleaned.sourceSnippet], ["Hello", null, "open", null, ""]);
  assert.equal(cleaned.createdAt, "1970-01-01T00:00:00.000Z");
  assert.ok(!("extraField" in cleaned));
});

test("the whole review-to-task pipeline works on a pasted message", () => {
  const drafts2 = extractTasksFromText("Please bring a hat by Friday.\nSarah to send the slides tomorrow.", WED);
  assert.equal(drafts2.length, 2);
});
