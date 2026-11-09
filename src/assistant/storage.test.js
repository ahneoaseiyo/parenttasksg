import test from "node:test";
import assert from "node:assert/strict";
import { STORAGE_KEY, createTaskStorage, getBrowserStorage } from "./storage.js";
import { SAMPLE_MESSAGE, createDemoExtractor, normalizeExtraction } from "./extractor.js";
import { MAX_STORED_TASKS, assignToMe, confirmDrafts, editDraft, setTaskStatus } from "./taskModel.js";

class FakeStorage {
  constructor() { this.map = new Map(); this.failWrites = false; this.failReads = false; this.failRemove = false; }
  getItem(k) { if (this.failReads) throw new Error("blocked"); return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { if (this.failWrites) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" }); this.map.set(k, String(v)); }
  removeItem(k) { if (this.failRemove) throw new Error("blocked"); this.map.delete(k); }
}
const task = (id, over = {}) => ({
  id, title: `Task ${id}`, owner: { kind: "unassigned", name: "" }, dueDate: null, status: "open", completedAt: null,
  createdAt: "2026-11-04T00:00:00.000Z", messageDate: "2026-11-04", sourceSnippet: "", dateExpression: null, extractorId: "demo-rules-v1", ...over,
});

test("tasks survive a reload (a new storage object over the same browser storage)", () => {
  const backing = new FakeStorage();
  const first = createTaskStorage(backing);
  const tasks = [task("a", { dueDate: "2026-11-20", owner: { kind: "me", name: "" } }), task("b", { owner: { kind: "other", name: "Sarah" } })];
  assert.deepEqual(first.save(tasks), { ok: true, error: null });
  const reloaded = createTaskStorage(backing).load();
  assert.deepEqual(reloaded, { tasks, problem: null });
});

test("status changes are persisted", () => {
  const backing = new FakeStorage();
  const store = createTaskStorage(backing);
  store.save([task("a")]);
  store.save(setTaskStatus(store.load().tasks, "a", "done", new Date("2026-11-05T01:02:03Z")));
  const [loaded] = createTaskStorage(backing).load().tasks;
  assert.deepEqual([loaded.status, loaded.completedAt], ["done", "2026-11-05T01:02:03.000Z"]);
});

test("nothing is stored until tasks are saved, and the first load is empty", () => {
  const backing = new FakeStorage();
  const store = createTaskStorage(backing);
  assert.deepEqual(store.load(), { tasks: [], problem: null });
  assert.equal(backing.map.size, 0);
});

test("the pasted message is never stored, only the confirmed tasks' short excerpts", async () => {
  const secret = "CONFIDENTIAL-TAIL: account 123-456-789 and home address 1 Example Road";
  const text = `${SAMPLE_MESSAGE}\n${secret}`;
  const extractor = createDemoExtractor();
  const { drafts } = normalizeExtraction(await extractor.extract({ text, receivedDate: "2026-11-04" }), { text, receivedDate: "2026-11-04", extractor });
  const reviewed = drafts.map((d) => (d.dateStatus === "ambiguous" ? editDraft(d, { dueDate: null }) : d)).map(assignToMe);
  const saved = confirmDrafts(reviewed, { messageDate: "2026-11-04", extractorId: extractor.id });
  const backing = new FakeStorage();
  createTaskStorage(backing).save(saved);
  const raw = backing.getItem(STORAGE_KEY);
  assert.ok(!raw.includes("CONFIDENTIAL"), "text that is not part of a task is not retained");
  assert.ok(!raw.includes("123-456-789"));
  assert.ok(!raw.includes(text));
  assert.ok(!raw.includes("Hi everyone, a quick update"), "even unrelated sentences are dropped");
  assert.equal([...backing.map.keys()].length, 1, "only one key is written");
  const noSnippets = confirmDrafts(reviewed, { messageDate: "2026-11-04", extractorId: extractor.id, keepSnippets: false });
  createTaskStorage(backing).save(noSnippets);
  assert.ok(!backing.getItem(STORAGE_KEY).includes("Please bring a water bottle and"), "snippets can be switched off entirely");
});

test("tampered or corrupted storage is sanitised instead of trusted", () => {
  const backing = new FakeStorage();
  const store = createTaskStorage(backing);
  backing.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks: [
    task("ok"), { id: "ok", title: "duplicate id" }, { id: "x", title: "" }, null, "str", 7,
    { id: "evil", title: "<script>alert(1)</script>", status: "root", owner: { kind: "admin" }, dueDate: "never", extra: { a: 1 } },
  ] }));
  const { tasks, problem } = store.load();
  assert.deepEqual(tasks.map((t) => t.id), ["ok", "evil"]);
  assert.equal(problem, "partial");
  assert.equal(tasks[1].title, "<script>alert(1)</script>", "kept as inert text");
  assert.deepEqual([tasks[1].status, tasks[1].dueDate, tasks[1].owner.kind], ["open", null, "unassigned"]);
  assert.ok(!("extra" in tasks[1]));
});

test("unreadable data, unknown versions and wrong shapes load as empty without throwing", () => {
  const backing = new FakeStorage();
  const store = createTaskStorage(backing);
  for (const bad of ["{not json", "null", "42", '"text"', JSON.stringify({ version: 2, tasks: [task("a")] }), JSON.stringify({ version: 1, tasks: "no" }), JSON.stringify({ tasks: [] })]) {
    backing.setItem(STORAGE_KEY, bad);
    assert.deepEqual(store.load(), { tasks: [], problem: "unreadable" }, bad);
  }
});

test("at most the maximum number of tasks is loaded", () => {
  const backing = new FakeStorage();
  backing.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks: Array.from({ length: MAX_STORED_TASKS + 50 }, (_, i) => task(`t${i}`)) }));
  assert.equal(createTaskStorage(backing).load().tasks.length, MAX_STORED_TASKS);
});

test("storage failures are reported, not thrown", () => {
  const backing = new FakeStorage();
  const store = createTaskStorage(backing);
  backing.failWrites = true;
  const result = store.save([task("a")]);
  assert.equal(result.ok, false);
  assert.match(result.error, /full or blocked/);
  backing.failReads = true;
  assert.deepEqual(store.load(), { tasks: [], problem: "unavailable" });
  const missing = createTaskStorage(null);
  assert.equal(missing.available, false);
  assert.equal(missing.save([task("a")]).ok, false);
  assert.match(missing.save([]).error, /unavailable/);
  assert.deepEqual(missing.load(), { tasks: [], problem: "unavailable" });
  assert.deepEqual(missing.clear(), { ok: true });
});

test("clear-all removes only this app's data", () => {
  const backing = new FakeStorage();
  backing.setItem("someone-else", "keep");
  const store = createTaskStorage(backing);
  store.save([task("a"), task("b")]);
  assert.deepEqual(store.clear(), { ok: true });
  assert.equal(backing.getItem(STORAGE_KEY), null);
  assert.equal(backing.getItem("someone-else"), "keep");
  assert.deepEqual(store.load(), { tasks: [], problem: null });
  backing.failRemove = true;
  assert.deepEqual(store.clear(), { ok: false });
});

test("browser storage that throws or is missing is detected safely", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
    assert.equal(getBrowserStorage(), null);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
    assert.equal(getBrowserStorage(), null);
    const full = new FakeStorage(); full.failWrites = true;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: full });
    assert.equal(getBrowserStorage(), null);
    const good = new FakeStorage();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: good });
    assert.strictEqual(getBrowserStorage(), good);
    assert.equal(good.map.size, 0, "the availability probe cleans up after itself");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original); else delete globalThis.localStorage;
  }
});

// ── preferences (three booleans, no message content) ──
import { DEFAULT_PREFS, PREFS_KEY, createPrefsStorage } from "./storage.js";

test("preferences default safely, round-trip, and ignore anything that is not a known boolean", () => {
  const backing = new FakeStorage();
  const prefs = createPrefsStorage(backing);
  assert.deepEqual(prefs.load(), DEFAULT_PREFS);
  assert.equal(DEFAULT_PREFS.keepSnippets, true);
  assert.deepEqual(prefs.save({ keepSnippets: false, includeCompleted: true, includeSource: true }), { ok: true });
  assert.deepEqual(createPrefsStorage(backing).load(), { keepSnippets: false, includeCompleted: true, includeSource: true });
  backing.setItem(PREFS_KEY, JSON.stringify({ version: 1, keepSnippets: "yes", includeCompleted: 1, includeSource: true, secret: "x", __proto__: { a: 1 } }));
  assert.deepEqual(prefs.load(), { keepSnippets: true, includeCompleted: false, includeSource: true });
  for (const bad of ["{oops", "null", "[]", JSON.stringify({ version: 2, keepSnippets: false })]) {
    backing.setItem(PREFS_KEY, bad);
    assert.deepEqual(prefs.load(), DEFAULT_PREFS, bad);
  }
  const saved = JSON.parse((prefs.save({ keepSnippets: false, extra: "message text" }), backing.getItem(PREFS_KEY)));
  assert.deepEqual(Object.keys(saved).sort(), ["includeCompleted", "includeSource", "keepSnippets", "version"], "only known fields are written");
});

test("preference storage failures and clearing are handled quietly", () => {
  const backing = new FakeStorage();
  const prefs = createPrefsStorage(backing);
  prefs.save({ includeSource: true });
  assert.deepEqual(prefs.clear(), { ok: true });
  assert.equal(backing.getItem(PREFS_KEY), null);
  backing.failWrites = true;
  assert.deepEqual(prefs.save({ includeSource: true }), { ok: false });
  backing.failReads = true;
  assert.deepEqual(prefs.load(), DEFAULT_PREFS);
  assert.deepEqual(createPrefsStorage(null).save({}), { ok: false });
  assert.deepEqual(createPrefsStorage(null).load(), DEFAULT_PREFS);
  backing.failRemove = true;
  assert.deepEqual(prefs.clear(), { ok: false });
});

test("save() says why it failed, and clear() only succeeds when the data is really gone", () => {
  const backing = new FakeStorage();
  const store = createTaskStorage(backing);
  const prefs = createPrefsStorage(backing);
  assert.deepEqual(createTaskStorage(null).save([]), { ok: false, reason: "unavailable", error: "Browser storage is unavailable, so this change could not be saved." });
  backing.failWrites = true;
  assert.deepEqual(store.save([task("a")]), { ok: false, reason: "failed", error: "Browser storage is full or blocked. Your latest change was not saved." });
  backing.failWrites = false;
  store.save([task("a")]); prefs.save({ keepSnippets: false });
  const silent = Object.create(backing, { removeItem: { value() {} } }); // removal appears to work but changes nothing
  assert.deepEqual(createTaskStorage(silent).clear(), { ok: false });
  assert.deepEqual(createPrefsStorage(silent).clear(), { ok: false });
  assert.ok(backing.getItem(STORAGE_KEY) && backing.getItem(PREFS_KEY), "the data is still there, and the result says so");
  assert.deepEqual(store.clear(), { ok: true });
  assert.deepEqual(prefs.clear(), { ok: true });
  assert.equal(backing.getItem(STORAGE_KEY) ?? backing.getItem(PREFS_KEY), null);
  assert.deepEqual(createTaskStorage(null).clear(), { ok: true }, "nothing to delete when there is no storage");
});
