import test from "node:test";
import assert from "node:assert/strict";
import { createApp, AUTH_TOKENS } from "./index.js";

async function startServer({ enableDemoAuth = true } = {}) {
  const app = createApp({ enableDemoAuth });
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
      body: JSON.stringify({ childId: "child_arielle_a", parentUserId: "parent_hafiz" }),
    });

    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("consent submission is denied for unrelated child", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/consents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader(AUTH_TOKENS.parentHafizCentreA),
      },
      body: JSON.stringify({ childId: "child_arielle_a" }),
    });

    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("task patch rejects unauthorized field modification", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/tasks/task_1`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeader(AUTH_TOKENS.teacherCentreA),
      },
      body: JSON.stringify({ parentUserId: "parent_hafiz" }),
    });

    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("settings patch rejects malformed values", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeader(AUTH_TOKENS.adminCentreA),
      },
      body: JSON.stringify({ retentionMonths: "24", unknownField: true }),
    });

    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cross-centre consent records are isolated", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const submitResponse = await fetch(`${baseUrl}/api/consents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeader(AUTH_TOKENS.parentMeiLingCentreA),
      },
      body: JSON.stringify({ childId: "child_arielle_a", decision: "agree" }),
    });
    assert.equal(submitResponse.status, 201);

    const response = await fetch(`${baseUrl}/api/consents`, {
      headers: authHeader(AUTH_TOKENS.teacherCentreB),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test("demo authentication is disabled unless explicitly enabled", async () => {
  const { server, baseUrl } = await startServer({ enableDemoAuth: false });
  try {
    const response = await fetch(`${baseUrl}/api/tasks`, {
      headers: authHeader(AUTH_TOKENS.adminCentreA),
    });
    assert.equal(response.status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test("consent requires stable child ID and rejects name-only input", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/consents`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader(AUTH_TOKENS.parentMeiLingCentreA) },
      body: JSON.stringify({ child: "Arielle", decision: "agree" }),
    });
    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test("AI extraction rejects parents and oversized messages", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const post = (token, message) => fetch(`${baseUrl}/api/ai/extract`, {
      method: "POST", headers: { "content-type": "application/json", ...authHeader(token) },
      body: JSON.stringify({ message }),
    });
    assert.equal((await post(AUTH_TOKENS.parentMeiLingCentreA, "Bring water")).status, 403);
    assert.equal((await post(AUTH_TOKENS.teacherCentreA, "a".repeat(4001))).status, 400);
    const allowed = await post(AUTH_TOKENS.teacherCentreA, "Bring water");
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).requiresApproval, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("AI extraction rate limit is enforced per user", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const post = () => fetch(`${baseUrl}/api/ai/extract`, {
      method: "POST", headers: { "content-type": "application/json", ...authHeader(AUTH_TOKENS.teacherCentreA) },
      body: JSON.stringify({ message: "Bring water" }),
    });
    for (let i = 0; i < 10; i++) assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
