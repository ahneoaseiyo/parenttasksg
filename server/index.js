import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { pathToFileURL } from "node:url";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";
const defaultAllowedOrigins = ["http://127.0.0.1:5173", "http://localhost:5173"];
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const ROLE_PARENT = "parent";
const ROLE_TEACHER = "teacher";
const ROLE_ADMIN = "admin";

export const AUTH_TOKENS = {
  parentMeiLingCentreA: "token_parent_mei_ling_centre_a",
  parentHafizCentreA: "token_parent_hafiz_centre_a",
  teacherCentreA: "token_teacher_centre_a",
  adminCentreA: "token_admin_centre_a",
  teacherCentreB: "token_teacher_centre_b",
};

const principalsByToken = new Map([
  [AUTH_TOKENS.parentMeiLingCentreA, { userId: "parent_mei_ling", role: ROLE_PARENT, centreId: "centre_a" }],
  [AUTH_TOKENS.parentHafizCentreA, { userId: "parent_hafiz", role: ROLE_PARENT, centreId: "centre_a" }],
  [AUTH_TOKENS.teacherCentreA, { userId: "teacher_joyce", role: ROLE_TEACHER, centreId: "centre_a" }],
  [AUTH_TOKENS.adminCentreA, { userId: "admin_siti", role: ROLE_ADMIN, centreId: "centre_a" }],
  [AUTH_TOKENS.teacherCentreB, { userId: "teacher_bala", role: ROLE_TEACHER, centreId: "centre_b" }],
]);

function buildInitialState() {
  return {
    tasks: [
      {
        id: "task_1",
        centreId: "centre_a",
        parentUserId: "parent_mei_ling",
        child: "Arielle",
        level: "K1",
        title: "Bring one clean cardboard box",
        category: "Things to bring",
        status: "Not done",
        priority: "High",
        dueLabel: "Tomorrow",
      },
      {
        id: "task_2",
        centreId: "centre_a",
        parentUserId: "parent_mei_ling",
        child: "Arielle",
        level: "K1",
        title: "Submit Wildlings excursion consent form",
        category: "Consent form",
        status: "Not done",
        priority: "High",
        dueLabel: "Sunday",
      },
    ],
    broadcasts: [
      {
        id: "broadcast_1",
        centreId: "centre_a",
        title: "Return signed consent form for Garden trip",
        category: "Consent form",
        dueLabel: "28 May",
        sentTo: 18,
        done: 11,
        pending: 7,
      },
    ],
    threads: [
      {
        id: "thread_1",
        centreId: "centre_a",
        parentUserId: "parent_mei_ling",
        parent: "Mei Ling Tan",
        child: "Arielle",
        level: "K1",
        topic: "Consent form",
        unread: 2,
        status: "Needs reply",
        messages: [
          {
            id: "msg_1",
            from: "parent",
            text: "Can Arielle still join if she has a mild cough?",
            time: "9:12 AM",
          },
        ],
      },
    ],
    consentSubmissions: [],
    auditEvents: [
      {
        id: "audit_1",
        centreId: "system",
        time: new Date().toISOString(),
        actor: "System",
        action: "API server started",
        type: "System",
        risk: "Low",
      },
    ],
    settingsByCentre: {
      centre_a: {
        retentionMonths: 24,
        aiApprovalRequired: true,
        notificationChannels: { push: true, email: true, sms: false, whatsapp: false },
        sensitiveFieldMasking: true,
      },
      centre_b: {
        retentionMonths: 24,
        aiApprovalRequired: true,
        notificationChannels: { push: true, email: true, sms: false, whatsapp: false },
        sensitiveFieldMasking: true,
      },
    },
  };
}

function audit(state, actor, action, centreId, type = "General", risk = "Low") {
  const event = { id: nanoid(), centreId, time: new Date().toISOString(), actor, action, type, risk };
  state.auditEvents.unshift(event);
  return event;
}

function detectLanguage(message) {
  if (/[一-龥]/.test(message)) return "Mandarin";
  if (/[அ-ஹ]/.test(message)) return "Tamil";
  if (/\b(ibu bapa|borang|tarikh|terima kasih|sila)\b/i.test(message)) return "Malay";
  return "English";
}

function demoExtract(message, settings) {
  const lower = message.toLowerCase();
  const language = detectLanguage(message);
  const tasks = [];
  const pushTask = (task) => {
    if (!tasks.some((t) => t.category === task.category && t.title === task.title)) tasks.push(task);
  };
  if (lower.includes("consent") || lower.includes("permission") || lower.includes("borang") || message.includes("同意") || message.includes("சம்மத")) {
    pushTask({ title: "Submit excursion consent form", category: "Consent form", dueLabel: lower.includes("28 may") ? "28 May" : "This week", priority: "High" });
  }
  if (lower.includes("pay") || lower.includes("fee")) {
    pushTask({ title: "Pay school fee", category: "Payment", dueLabel: lower.includes("27 may") ? "27 May" : "Before due date", priority: "Medium" });
  }
  if (message.includes("亲爱") || message.includes("家长")) {
    pushTask({ title: "Bring one clean cardboard box", category: "Things to bring", dueLabel: "Friday", priority: "High" });
  }
  if (lower.includes("bring") || lower.includes("pack") || lower.includes("water bottle") || lower.includes("snack") || lower.includes("covered shoes")) {
    pushTask({ title: "Pack required items", category: "Things to bring", dueLabel: "Before activity", priority: "High" });
  }
  if (tasks.length === 0) pushTask({ title: "Review school reminder", category: "Reminder", dueLabel: "Soon", priority: "Medium" });
  return { language, tasks, requiresApproval: settings.aiApprovalRequired };
}

function authenticate(req, res, next) {
  const authHeader = req.header("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const token = authHeader.slice(7).trim();
  const principal = principalsByToken.get(token);
  if (!principal) {
    return res.status(401).json({ error: "Invalid token" });
  }
  req.auth = principal;
  return next();
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}

function denyIfNotInCentre(req, res, resource) {
  if (resource.centreId !== req.auth.centreId) {
    res.status(403).json({ error: "Forbidden" });
    return true;
  }
  return false;
}

function denyIfNotResourceOwner(req, res, resource) {
  if (req.auth.role === ROLE_PARENT && resource.parentUserId !== req.auth.userId) {
    res.status(403).json({ error: "Forbidden" });
    return true;
  }
  return false;
}

function filterTaskPatch(reqBody, role) {
  const safePatch = { ...reqBody };
  delete safePatch.id;
  delete safePatch.centreId;

  if (role === ROLE_PARENT) {
    return Object.fromEntries(Object.entries(safePatch).filter(([key]) => key === "status"));
  }

  return safePatch;
}

export function createApp() {
  const app = express();
  const state = buildInitialState();

  app.use(
    cors({
      origin(origin, callback) {
        const effectiveAllowedOrigins = allowedOrigins.length > 0 ? allowedOrigins : defaultAllowedOrigins;
        if (!origin || effectiveAllowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("CORS origin not allowed"));
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "parenttask-sg-api" }));

  app.use("/api", authenticate);

  app.get("/api/tasks", (req, res) => {
    const tasks = state.tasks.filter((task) => {
      if (task.centreId !== req.auth.centreId) return false;
      if (req.auth.role === ROLE_PARENT) return task.parentUserId === req.auth.userId;
      return true;
    });
    res.json(tasks);
  });

  app.post("/api/tasks", requireRoles(ROLE_TEACHER, ROLE_ADMIN), (req, res) => {
    const payload = { ...req.body };
    delete payload.id;
    delete payload.centreId;
    const task = { id: nanoid(), status: "Not done", centreId: req.auth.centreId, ...payload };
    state.tasks.unshift(task);
    audit(state, "Teacher", `Created task: ${task.title}`, req.auth.centreId, "Task");
    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const task = state.tasks.find((entry) => entry.id === req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (denyIfNotInCentre(req, res, task)) return undefined;
    if (denyIfNotResourceOwner(req, res, task)) return undefined;

    Object.assign(task, filterTaskPatch(req.body || {}, req.auth.role));
    audit(state, "User", `Updated task: ${task.title}`, req.auth.centreId, "Task");
    return res.json(task);
  });

  app.get("/api/broadcasts", (req, res) => {
    const broadcasts = state.broadcasts.filter((broadcast) => broadcast.centreId === req.auth.centreId);
    res.json(broadcasts);
  });

  app.post("/api/broadcasts", requireRoles(ROLE_TEACHER, ROLE_ADMIN), (req, res) => {
    const payload = { ...req.body };
    delete payload.id;
    delete payload.centreId;
    const broadcast = { id: nanoid(), centreId: req.auth.centreId, sentTo: 0, done: 0, pending: 0, ...payload };
    state.broadcasts.unshift(broadcast);
    audit(state, "Teacher", `Sent broadcast: ${broadcast.title}`, req.auth.centreId, "Broadcast");
    res.status(201).json(broadcast);
  });

  app.get("/api/messages/threads", requireRoles(ROLE_PARENT, ROLE_TEACHER, ROLE_ADMIN), (req, res) => {
    const threads = state.threads.filter((thread) => {
      if (thread.centreId !== req.auth.centreId) return false;
      if (req.auth.role === ROLE_PARENT) return thread.parentUserId === req.auth.userId;
      return true;
    });
    res.json(threads);
  });

  app.post("/api/messages/threads/:id/messages", requireRoles(ROLE_PARENT, ROLE_TEACHER, ROLE_ADMIN), (req, res) => {
    const thread = state.threads.find((entry) => entry.id === req.params.id);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    if (denyIfNotInCentre(req, res, thread)) return undefined;
    if (denyIfNotResourceOwner(req, res, thread)) return undefined;

    const rawText = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!rawText) return res.status(400).json({ error: "Message text is required" });

    const isParent = req.auth.role === ROLE_PARENT;
    const message = { id: nanoid(), from: isParent ? "parent" : "teacher", text: rawText, time: "Just now" };
    thread.messages.push(message);
    thread.status = isParent ? "Needs reply" : "Open";
    thread.unread = isParent ? thread.unread + 1 : 0;
    audit(state, isParent ? "Parent" : "Teacher", `Added message in ${thread.child} thread`, req.auth.centreId, "Message");
    res.status(201).json(message);
  });

  app.get("/api/consents", requireRoles(ROLE_PARENT, ROLE_TEACHER, ROLE_ADMIN), (req, res) => {
    const submissions = state.consentSubmissions.filter((submission) => {
      if (submission.centreId !== req.auth.centreId) return false;
      if (req.auth.role === ROLE_PARENT) return submission.parentUserId === req.auth.userId;
      return true;
    });
    res.json(submissions);
  });

  app.post("/api/consents", requireRoles(ROLE_PARENT), (req, res) => {
    const payload = { ...req.body };
    delete payload.id;
    delete payload.centreId;
    delete payload.parentUserId;

    const submission = {
      id: nanoid(),
      submittedAt: new Date().toISOString(),
      centreId: req.auth.centreId,
      parentUserId: req.auth.userId,
      ...payload,
    };
    state.consentSubmissions.unshift(submission);
    audit(state, "Parent", `Submitted consent for ${submission.child || "child"}`, req.auth.centreId, "Consent");
    res.status(201).json(submission);
  });

  app.post("/api/ai/extract", (req, res) => {
    const centreSettings = state.settingsByCentre[req.auth.centreId] || state.settingsByCentre.centre_a;
    const result = demoExtract(req.body?.message || "", centreSettings);
    audit(state, "AI Service", `Generated ${result.tasks.length} extraction draft(s)`, req.auth.centreId, "AI", "Medium");
    res.json(result);
  });

  app.get("/api/audit", requireRoles(ROLE_ADMIN), (req, res) => {
    res.json(state.auditEvents.filter((event) => event.centreId === req.auth.centreId || event.centreId === "system"));
  });

  app.get("/api/settings", requireRoles(ROLE_ADMIN), (req, res) => {
    const settings = state.settingsByCentre[req.auth.centreId];
    if (!settings) return res.status(404).json({ error: "Settings not found" });
    return res.json(settings);
  });

  app.patch("/api/settings", requireRoles(ROLE_ADMIN), (req, res) => {
    const settings = state.settingsByCentre[req.auth.centreId];
    if (!settings) return res.status(404).json({ error: "Settings not found" });
    Object.assign(settings, req.body || {});
    audit(state, "Centre Admin", "Updated centre policy settings", req.auth.centreId, "Admin", "Medium");
    return res.json(settings);
  });

  return app;
}

const app = createApp();
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  app.listen(port, host, () => {
    console.log(`ParentTask SG API listening on http://${host}:${port}`);
  });
}
