import test from "node:test";
import assert from "node:assert/strict";
import { createTaskApi, TaskApiError } from "./taskApi.js";

test("missing authentication fails closed before network access", async () => {
  let called = false;
  const api = createTaskApi({
    getAccessToken: async () => null,
    fetchImpl: async () => { called = true; },
  });
  await assert.rejects(api.listTasks(), (error) => error instanceof TaskApiError && error.status === 401);
  assert.equal(called, false);
});

test("task listing supplies bearer authentication and omits cookies", async () => {
  const api = createTaskApi({
    getAccessToken: async () => "synthetic-test-token",
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/tasks");
      assert.equal(options.headers.Authorization, "Bearer synthetic-test-token");
      assert.equal(options.credentials, "omit");
      return { ok: true, json: async () => [{ id: "task_1" }] };
    },
  });
  assert.deepEqual(await api.listTasks(), [{ id: "task_1" }]);
});

test("status update sends only a validated status", async () => {
  const api = createTaskApi({
    getAccessToken: async () => "synthetic-test-token",
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/tasks/task_1");
      assert.equal(options.method, "PATCH");
      assert.deepEqual(JSON.parse(options.body), { status: "Done" });
      return { ok: true, json: async () => ({ id: "task_1", status: "Done" }) };
    },
  });
  assert.equal((await api.updateTaskStatus("task_1", "Done")).status, "Done");
  assert.throws(() => api.updateTaskStatus("task_1", "Signed"), TypeError);
  assert.throws(() => api.updateTaskStatus("../other", "Done"), TypeError);
});

test("forbidden response is surfaced without treating it as success", async () => {
  const api = createTaskApi({
    getAccessToken: async () => "synthetic-test-token",
    fetchImpl: async () => ({ ok: false, status: 403 }),
  });
  await assert.rejects(api.updateTaskStatus("task_1", "Done"), (error) => error.status === 403);
});

test("network errors do not expose internal details", async () => {
  const api = createTaskApi({
    getAccessToken: async () => "synthetic-test-token",
    fetchImpl: async () => { throw new Error("internal network information"); },
  });
  await assert.rejects(api.listTasks(), (error) => error.message === "Network unavailable");
});
