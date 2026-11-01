import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, AUTH_TOKENS } from "./index.js";

async function launch(path) {
  const app = createApp({ enableDemoAuth: true, taskDbPath: path });
  const server = await new Promise(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  return {
    url: "http://127.0.0.1:" + server.address().port,
    async close() {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      app.locals.closeTaskStore();
    },
  };
}

async function api(instance, token, method = "GET", path = "/api/tasks", payload) {
  const response = await fetch(instance.url + path, {
    method,
    headers: {
      authorization: "Bearer " + token,
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  return { status: response.status, body: await response.json() };
}

test("SQLite API retains authorized status changes across server restart and rejects unauthorized changes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "parenttask-api-sqlite-"));
  const path = join(dir, "tasks.sqlite");
  let instance;
  try {
    instance = await launch(path);
    const owner = AUTH_TOKENS.parentMeiLingCentreA;
    const otherParent = AUTH_TOKENS.parentHafizCentreA;
    const otherCentre = AUTH_TOKENS.teacherCentreB;

    const before = await api(instance, owner);
    assert.equal(before.status, 200);
    assert.ok(before.body.some(task => task.id === "task_1"));

    const deniedParent = await api(instance, otherParent, "PATCH", "/api/tasks/task_1", { status: "Done" });
    assert.equal(deniedParent.status, 403);
    const deniedCentre = await api(instance, otherCentre, "PATCH", "/api/tasks/task_1", { status: "Done" });
    assert.equal(deniedCentre.status, 403);
    const deniedField = await api(instance, owner, "PATCH", "/api/tasks/task_1", { centreId: "centre_b" });
    assert.equal(deniedField.status, 400);

    const updated = await api(instance, owner, "PATCH", "/api/tasks/task_1", { status: "Done" });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.status, "Done");

    await instance.close();
    instance = null;
    instance = await launch(path);
    const after = await api(instance, owner);
    assert.equal(after.status, 200);
    assert.equal(after.body.find(task => task.id === "task_1").status, "Done");

    const unrelated = await api(instance, otherParent);
    assert.equal(unrelated.status, 200);
    assert.ok(unrelated.body.every(task => task.parentUserId !== "parent_mei_ling"));
    const centreB = await api(instance, otherCentre);
    assert.equal(centreB.status, 200);
    assert.ok(centreB.body.every(task => task.centreId === "centre_b"));
  } finally {
    if (instance) await instance.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SQLite API persists teacher-created tasks but blocks cross-centre access", async () => {
  const dir = mkdtempSync(join(tmpdir(), "parenttask-api-sqlite-"));
  let instance;
  try {
    const path = join(dir, "tasks.sqlite");
    instance = await launch(path);
    const created = await api(instance, AUTH_TOKENS.teacherCentreA, "POST", "/api/tasks", {
      parentUserId: "parent_mei_ling",
      child: "Arielle",
      level: "K1",
      title: "Bring a reusable bottle",
      category: "Things to bring",
      dueLabel: "Tomorrow",
      priority: "High",
    });
    assert.equal(created.status, 201);
    const id = created.body.id;
    assert.ok(id);

    const forbidden = await api(instance, AUTH_TOKENS.teacherCentreB, "PATCH", "/api/tasks/" + id, { status: "Done" });
    assert.equal(forbidden.status, 403);
    await instance.close();
    instance = null;

    instance = await launch(path);
    const ownerTasks = await api(instance, AUTH_TOKENS.parentMeiLingCentreA);
    assert.ok(ownerTasks.body.some(task => task.id === id));
    const otherParentTasks = await api(instance, AUTH_TOKENS.parentHafizCentreA);
    assert.ok(!otherParentTasks.body.some(task => task.id === id));
  } finally {
    if (instance) await instance.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
