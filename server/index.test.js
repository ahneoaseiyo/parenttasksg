import test from "node:test";
import assert from "node:assert/strict";
import { createApp, AUTH_TOKENS } from "./index.js";

async function startServer() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function authHeader(token) {
  return token ? { authorization: "Bearer ".concat(token) } : {};
}

test("anonymous API access is denied", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/tasks`);
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cross-user task update is denied for parent", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/tasks/task_1`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeader(AUTH_TOKENS.parentHafizCentreA),
      },
      body: JSON.stringify({ status: "Done" }),
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cross-centre task update is denied for teacher", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/tasks/task_1`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeader(AUTH_TOKENS.teacherCentreB),
      },
      body: JSON.stringify({ status: "Done" }),
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cross-user thread message post is denied for parent", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/messages/threads/thread_1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader(AUTH_TOKENS.parentHafizCentreA),
      },
      body: JSON.stringify({ text: "Please update me" }),
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("non-admin cannot access settings or audit", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const settingsResponse = await fetch(`${baseUrl}/api/settings`, {
      headers: authHeader(AUTH_TOKENS.parentMeiLingCentreA),
    });
    assert.equal(settingsResponse.status, 403);

    const auditResponse = await fetch(`${baseUrl}/api/audit`, {
      headers: authHeader(AUTH_TOKENS.teacherCentreA),
    });
    assert.equal(auditResponse.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("consent submission cannot spoof another parent", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/consents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader(AUTH_TOKENS.parentMeiLingCentreA),
      },
      body: JSON.stringify({ child: "Arielle", parentUserId: "parent_hafiz" }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.parentUserId, "parent_mei_ling");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
