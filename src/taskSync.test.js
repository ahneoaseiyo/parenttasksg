import test from "node:test";
import assert from "node:assert/strict";
import { loadVerifiedTasks, saveVerifiedStatus } from "./taskSync.js";

const task = { id: "task_1", title: "Bring a box", child: "Arielle", category: "Things to bring", status: "Not done" };

test("only server-returned tasks are loaded", async () => {
  const records = await loadVerifiedTasks({ listTasks: async () => [task] });
  assert.equal(records.length, 1);
  assert.equal(records[0].id, "task_1");
  assert.deepEqual(records[0].sharedWith, []);
});

test("malformed API responses fail instead of falling back to demo tasks", async () => {
  await assert.rejects(loadVerifiedTasks({ listTasks: async () => ({ tasks: [] }) }), TypeError);
});

test("task status changes only after server confirmation", async () => {
  const updated = await saveVerifiedStatus({
    updateTaskStatus: async (id, status) => ({ ...task, id, status }),
  }, task);
  assert.equal(updated.status, "Done");
});

test("a rejected or mismatched update cannot appear successful", async () => {
  await assert.rejects(saveVerifiedStatus({
    updateTaskStatus: async () => { throw new Error("Forbidden"); },
  }, task), /Forbidden/);
  await assert.rejects(saveVerifiedStatus({
    updateTaskStatus: async () => ({ ...task, status: "Not done" }),
  }, task), /did not confirm/);
});

test("consent tasks cannot use ordinary completion endpoint", async () => {
  let called = false;
  await assert.rejects(saveVerifiedStatus({
    updateTaskStatus: async () => { called = true; },
  }, { ...task, category: "Consent form" }), /Consent/);
  assert.equal(called, false);
});
