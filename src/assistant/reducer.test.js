import test from "node:test";
import assert from "node:assert/strict";
import {
  assistantReducer, canExtract, canSave, clampText, countChars, initialState,
} from "./reducer.js";
import { MAX_MESSAGE_CHARS, SAMPLE_MESSAGE, createDemoExtractor, normalizeExtraction } from "./extractor.js";
import { confirmDrafts } from "./taskModel.js";

const WED = "2026-11-04";
const run = (state, ...actions) => actions.reduce(assistantReducer, state);
async function reviewed(text = SAMPLE_MESSAGE) {
  const extractor = createDemoExtractor();
  let state = run(initialState(WED), { type: "text/set", text }, { type: "extract/start" });
  const extraction = normalizeExtraction(await extractor.extract({ text, receivedDate: WED }), { text, receivedDate: WED, extractor });
  return run(state, { type: "extract/success", requestId: state.requestId, extraction });
}

test("the message date defaults to the supplied local date and rejects invalid dates", () => {
  const state = initialState(WED);
  assert.equal(state.receivedDate, WED);
  assert.strictEqual(assistantReducer(state, { type: "date/set", date: "2026-02-30" }), state);
  assert.equal(assistantReducer(state, { type: "date/set", date: "2026-11-01" }).receivedDate, "2026-11-01");
});

test("the 2,500 character limit is enforced by code points, with a visible truncation flag", () => {
  assert.equal(MAX_MESSAGE_CHARS, 2500);
  const exact = "a".repeat(2500);
  assert.deepEqual([countChars(exact), clampText(exact).truncated], [2500, false]);
  const over = clampText("a".repeat(2600));
  assert.deepEqual([over.text.length, over.truncated], [2500, true]);
  const emoji = clampText("😀".repeat(2600));
  assert.equal(countChars(emoji.text), 2500);
  assert.ok(!/[\ud800-\udbff]$/.test(emoji.text), "no half emoji at the cut");
  const state = assistantReducer(initialState(WED), { type: "text/set", text: "b".repeat(3000) });
  assert.deepEqual([countChars(state.text), state.truncated], [2500, true]);
  assert.equal(assistantReducer(state, { type: "text/set", text: "short" }).truncated, false);
});

test("extraction needs text and a valid date", () => {
  assert.equal(canExtract(initialState(WED)), false);
  assert.equal(canExtract(run(initialState(WED), { type: "text/set", text: "   \n " })), false);
  assert.equal(canExtract(run(initialState(WED), { type: "text/set", text: "Please bring a hat" })), true);
  assert.equal(canExtract({ ...run(initialState(WED), { type: "text/set", text: "x" }), receivedDate: "" }), false);
  const state = run(initialState(WED), { type: "text/set", text: "Please bring a hat" }, { type: "extract/start" });
  assert.equal(state.status, "extracting");
  assert.equal(canExtract(state), false, "no double submission");
});

test("paste → extract → review → confirm → save → copy-ready tasks", async () => {
  let state = await reviewed();
  assert.equal(state.status, "review");
  assert.equal(state.extraction.isDemo, true);
  assert.equal(state.drafts.length, 6);
  assert.equal(canSave(state), false, "explicit confirmation is required");
  const fee = state.drafts.find((d) => d.title.startsWith("Pay"));
  const venue = state.drafts.find((d) => d.title.startsWith("Book"));
  state = run(state, { type: "confirm/set", value: true });
  assert.equal(state.confirmed, false, "cannot confirm while deadlines are ambiguous");
  state = run(state,
    { type: "draft/edit", id: fee.id, patch: { dueDate: fee.dateCandidates[0] } },
    { type: "draft/edit", id: venue.id, patch: { dueDate: null } },
    { type: "draft/edit", id: state.drafts[0].id, patch: { title: "Bring water bottle and spare clothes" } },
    { type: "draft/assignToMe", id: state.drafts[0].id },
    { type: "draft/remove", id: state.drafts[5].id });
  assert.equal(state.drafts.length, 5);
  assert.deepEqual(state.drafts[0].owner, { kind: "me", name: "" });
  state = run(state, { type: "confirm/set", value: true });
  assert.equal(canSave(state), true);
  const saved = confirmDrafts(state.drafts, { messageDate: state.receivedDate, extractorId: state.extraction.extractorId });
  assert.equal(saved.length, 5);
  state = run(state, { type: "saved", notice: "Saved 5 tasks" });
  assert.deepEqual([state.text, state.drafts, state.status, state.extraction, state.confirmed], ["", [], "idle", null, false], "message and drafts dropped after saving");
  assert.equal(state.receivedDate, WED);
  assert.equal(state.notice, "Saved 5 tasks");
});

test("any edit after confirming withdraws the confirmation", async () => {
  let state = await reviewed("Please bring a hat.");
  state = run(state, { type: "confirm/set", value: true });
  assert.equal(canSave(state), true);
  for (const action of [
    { type: "draft/edit", id: state.drafts[0].id, patch: { title: "New" } },
    { type: "draft/assignToMe", id: state.drafts[0].id },
  ]) {
    const again = run(state, { type: "confirm/set", value: true });
    assert.equal(run(again, action).confirmed, false);
  }
  assert.equal(run(state, { type: "draft/remove", id: state.drafts[0].id }).confirmed, false);
  assert.equal(canSave(run(state, { type: "draft/remove", id: state.drafts[0].id }, { type: "confirm/set", value: true })), false, "nothing left to save");
});

test("changing the message or date discards a stale review", async () => {
  const state = await reviewed();
  const edited = assistantReducer(state, { type: "text/set", text: state.text + " Please bring a pen." });
  assert.deepEqual([edited.status, edited.drafts, edited.extraction], ["idle", [], null]);
  assert.match(edited.notice, /Extract again/);
  const dated = assistantReducer(state, { type: "date/set", date: "2026-11-10" });
  assert.deepEqual([dated.status, dated.drafts.length], ["idle", 0]);
  assert.match(dated.notice, /date changed/);
  assert.equal(assistantReducer(state, { type: "text/set", text: state.text }), state, "no change, no reset");
});

test("a late extraction result for an older message is ignored", async () => {
  const extractor = createDemoExtractor();
  let state = run(initialState(WED), { type: "text/set", text: "Please bring a hat." }, { type: "extract/start" });
  const staleId = state.requestId;
  const extraction = normalizeExtraction(await extractor.extract({ text: state.text, receivedDate: WED }), { text: state.text, receivedDate: WED, extractor });
  state = run(state, { type: "text/set", text: "Please bring a coat." }); // user edits while extracting
  const after = assistantReducer(state, { type: "extract/success", requestId: staleId, extraction });
  assert.deepEqual([after.status, after.drafts.length], ["idle", 0]);
  const failed = assistantReducer(run(initialState(WED), { type: "text/set", text: "Please bring a hat." }, { type: "extract/start" }), { type: "extract/failure", requestId: 999, message: "x" });
  assert.equal(failed.status, "extracting", "stale failures are ignored too");
});

test("extractor failures surface an error and leave the message intact", () => {
  let state = run(initialState(WED), { type: "text/set", text: "Please bring a hat." }, { type: "extract/start" });
  state = assistantReducer(state, { type: "extract/failure", requestId: state.requestId, message: "Boom" });
  assert.deepEqual([state.status, state.error, state.text], ["error", "Boom", "Please bring a hat."]);
  assert.equal(canExtract(state), true, "the user can retry");
});

test("a review with no tasks cannot be saved, and reset clears everything", async () => {
  const state = await reviewed("Thanks, see you soon!");
  assert.equal(state.status, "review");
  assert.equal(state.drafts.length, 0);
  assert.equal(canSave(run(state, { type: "confirm/set", value: true })), false);
  const reset = assistantReducer(await reviewed(), { type: "reset", today: "2026-12-01" });
  assert.deepEqual([reset.text, reset.drafts, reset.receivedDate, reset.status], ["", [], "2026-12-01", "idle"]);
});

test("keep-source-text defaults on, is toggleable and survives saving", async () => {
  let state = await reviewed("Please bring a hat.");
  assert.equal(state.keepSnippets, true);
  state = run(state, { type: "keepSnippets/set", value: false }, { type: "saved" });
  assert.equal(state.keepSnippets, false);
});
