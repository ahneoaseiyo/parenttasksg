import { openConsentStore } from "./consentStore.js";
import { openTaskStore } from "./taskStore.js";
import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { pathToFileURL } from "node:url";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const defaultAllowedOrigins = ["http://127.0.0.1:5173", "http://localhost:5173"];
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const ROLE_PARENT = "parent";
const ROLE_TEACHER = "teacher";
const ROLE_ADMIN = "admin";
const NODE_ENV = process.env.NODE_ENV || "development";
const DEMO_TOKEN_AUTH_ENABLED = NODE_ENV !== "production" && process.env.ENABLE_DEMO_AUTH === "true";
const MAX_SHORT_TEXT_LENGTH = 120;
const MAX_NOTE_LENGTH = 500;

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

const parentPrincipalsByCentre = new Map();
for (const principal of principalsByToken.values()) {
  if (principal.role !== ROLE_PARENT) continue;
  if (!parentPrincipalsByCentre.has(principal.centreId)) {
    parentPrincipalsByCentre.set(principal.centreId, new Set());
  }
  parentPrincipalsByCentre.get(principal.centreId).add(principal.userId);
}

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
    children: [{ id: "child_arielle_a", centreId: "centre_a", name: "Arielle" }],
    parentChildLinks: [{ centreId: "centre_a", parentUserId: "parent_mei_ling", childId: "child_arielle_a" }],
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
  if (!req.app.locals.demoAuthEnabled) {
    return res.status(503).json({ error: "Demo token authentication is disabled in production" });
  }
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

function hasOnlyKnownKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isNonEmptyString(value, maxLength = MAX_SHORT_TEXT_LENGTH) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function normalizeShortText(value, maxLength = MAX_SHORT_TEXT_LENGTH) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeOptionalShortText(value, maxLength = MAX_SHORT_TEXT_LENGTH) {
  if (value === undefined) return undefined;
  return normalizeShortText(value, maxLength);
}

function normalizeOptionalNote(value) {
  if (value === undefined) return undefined;
  return normalizeShortText(value, MAX_NOTE_LENGTH);
}

function validateTaskCreatePayload(rawPayload, centreId) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const allowedKeys = new Set(["parentUserId", "child", "level", "title", "category", "dueLabel", "priority"]);
  if (!hasOnlyKnownKeys(payload, allowedKeys)) return { error: "Unexpected task fields" };

  const task = {
    parentUserId: normalizeShortText(payload.parentUserId),
    child: normalizeShortText(payload.child),
    level: normalizeShortText(payload.level),
    title: normalizeShortText(payload.title),
    category: normalizeShortText(payload.category),
    dueLabel: normalizeShortText(payload.dueLabel),
    priority: normalizeShortText(payload.priority),
  };

  if (
    !isNonEmptyString(task.parentUserId) ||
    !isNonEmptyString(task.child) ||
    !isNonEmptyString(task.level) ||
    !isNonEmptyString(task.title) ||
    !isNonEmptyString(task.category) ||
    !isNonEmptyString(task.dueLabel) ||
    !isNonEmptyString(task.priority)
  ) {
    return { error: "Invalid task payload" };
  }

  const parentUsers = parentPrincipalsByCentre.get(centreId);
  if (!parentUsers || !parentUsers.has(task.parentUserId)) {
    return { error: "Unknown parent for centre" };
  }

  return { value: task };
}

function validateTaskPatchPayload(rawPayload, role) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const parentAllowedKeys = new Set(["status"]);
  const staffAllowedKeys = new Set(["child", "level", "title", "category", "status", "priority", "dueLabel"]);
  const allowedKeys = role === ROLE_PARENT ? parentAllowedKeys : staffAllowedKeys;

  if (!hasOnlyKnownKeys(payload, allowedKeys)) return { error: "Unexpected task fields" };
  if (Object.keys(payload).length === 0) return { error: "No task fields provided" };

  const patch = {};
  for (const [key, value] of Object.entries(payload)) {
    const normalized = normalizeShortText(value);
    if (!isNonEmptyString(normalized)) return { error: "Invalid task payload" };
    patch[key] = normalized;
  }
  return { value: patch };
}

function validateBroadcastCreatePayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const allowedKeys = new Set(["title", "category", "dueLabel"]);
  if (!hasOnlyKnownKeys(payload, allowedKeys)) return { error: "Unexpected broadcast fields" };

  const broadcast = {
    title: normalizeShortText(payload.title),
    category: normalizeShortText(payload.category),
    dueLabel: normalizeShortText(payload.dueLabel),
  };
  if (!isNonEmptyString(broadcast.title) || !isNonEmptyString(broadcast.category) || !isNonEmptyString(broadcast.dueLabel)) {
    return { error: "Invalid broadcast payload" };
  }
  return { value: broadcast };
}

function validateConsentPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const allowedKeys = new Set(["childId", "consentRequestId", "decision", "notes"]);
  if (!hasOnlyKnownKeys(payload, allowedKeys)) return { error: "Unexpected consent fields" };

  const childId = normalizeShortText(payload.childId);
  if (!isNonEmptyString(childId)) return { error: "Consent childId is required" };

  const consentRequestId = normalizeOptionalShortText(payload.consentRequestId);
  if (!isNonEmptyString(consentRequestId)) return { error: "Consent request ID is required" };
  const decision = normalizeOptionalShortText(payload.decision);
  if (decision !== undefined && !isNonEmptyString(decision)) return { error: "Invalid consent payload" };

  const notes = normalizeOptionalNote(payload.notes);
  if (notes !== undefined && !isNonEmptyString(notes, MAX_NOTE_LENGTH)) return { error: "Invalid consent payload" };

  return { value: { childId, consentRequestId, ...(decision !== undefined ? { decision } : {}), ...(notes !== undefined ? { notes } : {}) } };
}

function parentOwnsChild(state, centreId, parentUserId, childId) {
  return state.children.some((child) => child.id === childId && child.centreId === centreId) &&
    state.parentChildLinks.some((link) => link.centreId === centreId && link.parentUserId === parentUserId && link.childId === childId);
}

function validateSettingsPatchPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const allowedKeys = new Set(["retentionMonths", "aiApprovalRequired", "notificationChannels", "sensitiveFieldMasking"]);
  if (!hasOnlyKnownKeys(payload, allowedKeys)) return { error: "Unexpected settings fields" };
  if (Object.keys(payload).length === 0) return { error: "No settings fields provided" };

  const patch = {};
  if (Object.hasOwn(payload, "retentionMonths")) {
    if (!Number.isInteger(payload.retentionMonths) || payload.retentionMonths < 1 || payload.retentionMonths > 120) {
      return { error: "Invalid retentionMonths" };
    }
    patch.retentionMonths = payload.retentionMonths;
  }
  if (Object.hasOwn(payload, "aiApprovalRequired")) {
    if (typeof payload.aiApprovalRequired !== "boolean") return { error: "Invalid aiApprovalRequired" };
    patch.aiApprovalRequired = payload.aiApprovalRequired;
  }
  if (Object.hasOwn(payload, "sensitiveFieldMasking")) {
    if (typeof payload.sensitiveFieldMasking !== "boolean") return { error: "Invalid sensitiveFieldMasking" };
    patch.sensitiveFieldMasking = payload.sensitiveFieldMasking;
  }
  if (Object.hasOwn(payload, "notificationChannels")) {
    const channels = payload.notificationChannels;
    const allowedChannelKeys = new Set(["push", "email", "sms", "whatsapp"]);
    if (!channels || typeof channels !== "object" || Array.isArray(channels) || !hasOnlyKnownKeys(channels, allowedChannelKeys)) {
      return { error: "Invalid notificationChannels" };
    }
    const channelPatch = {};
    for (const [key, value] of Object.entries(channels)) {
      if (typeof value !== "boolean") return { error: "Invalid notificationChannels" };
      channelPatch[key] = value;
    }
    patch.notificationChannels = channelPatch;
  }

  return { value: patch };
}

export function createApp({ enableDemoAuth = DEMO_TOKEN_AUTH_ENABLED, taskDbPath = process.env.TASK_DB_PATH } = {}) {
  const app = express();
  app.locals.demoAuthEnabled = NODE_ENV !== "production" && enableDemoAuth === true;
  const state = buildInitialState();
  const taskStore = taskDbPath ? openTaskStore(taskDbPath, state.tasks) : null;
  const consentStore = taskStore ? openConsentStore(taskDbPath) : null;
  app.locals.closeTaskStore = () => {
    consentStore?.close();
    taskStore?.close();
  };

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
    const tasks = (taskStore ? taskStore.list(req.auth.centreId, req.auth.role === ROLE_PARENT ? req.auth.userId : null) : state.tasks).filter((task) => {
      if (task.centreId !== req.auth.centreId) return false;
      if (req.auth.role === ROLE_PARENT) return task.parentUserId === req.auth.userId;
      return true;
    });
    res.json(tasks);
  });

  function taskAuditEvent(req, action, resourceId) {
    return {
      id: nanoid(),
      centreId: req.auth.centreId,
      time: new Date().toISOString(),
      actorId: req.auth.userId,
      actorRole: req.auth.role,
      action,
      resourceType: "Task",
      resourceId,
    };
  }

  app.post("/api/tasks", requireRoles(ROLE_TEACHER, ROLE_ADMIN), (req, res) => {
    const parsed = validateTaskCreatePayload(req.body, req.auth.centreId);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const task = { id: nanoid(), status: "Not done", centreId: req.auth.centreId, ...parsed.value };
    if (taskStore) taskStore.create(task, taskAuditEvent(req, "task.created", task.id));
    else {
      state.tasks.unshift(task);
      audit(state, "Teacher", `Created task: ${task.title}`, req.auth.centreId, "Task");
    }
    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const task = taskStore ? taskStore.get(req.params.id) : state.tasks.find((entry) => entry.id === req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (denyIfNotInCentre(req, res, task)) return undefined;
    if (denyIfNotResourceOwner(req, res, task)) return undefined;

    const parsed = validateTaskPatchPayload(req.body, req.auth.role);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const savedTask = taskStore
      ? taskStore.update(task.id, parsed.value, taskAuditEvent(req, "task.updated", task.id))
      : Object.assign(task, parsed.value);
    if (!taskStore) audit(state, "User", `Updated task: ${task.title}`, req.auth.centreId, "Task");
    return res.json(savedTask);
  });

  app.get("/api/broadcasts", (req, res) => {
    const broadcasts = state.broadcasts.filter((broadcast) => broadcast.centreId === req.auth.centreId);
    res.json(broadcasts);
  });

  app.post("/api/broadcasts", requireRoles(ROLE_TEACHER, ROLE_ADMIN), (req, res) => {
    const parsed = validateBroadcastCreatePayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const broadcast = { id: nanoid(), centreId: req.auth.centreId, sentTo: 0, done: 0, pending: 0, ...parsed.value };
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

  function consentAudit(req,action,id) {
    return {id:nanoid(),centreId:req.auth.centreId,time:new Date().toISOString(),
      actorId:req.auth.userId,actorRole:req.auth.role,action,resourceType:"ConsentRequest",resourceId:id};
  }

  app.get("/api/consent-requests", requireRoles(ROLE_PARENT,ROLE_TEACHER,ROLE_ADMIN), (req,res) => {
    if (!consentStore) return res.status(503).json({error:"Consent request storage unavailable"});
    const childIds=req.auth.role===ROLE_PARENT
      ? state.parentChildLinks.filter(link=>link.centreId===req.auth.centreId&&link.parentUserId===req.auth.userId).map(link=>link.childId)
      : null;
    return res.json(consentStore.listRequests(req.auth.centreId,childIds));
  });

  app.post("/api/consent-requests", requireRoles(ROLE_TEACHER,ROLE_ADMIN), (req,res) => {
    if (!consentStore) return res.status(503).json({error:"Consent request storage unavailable"});
    const body=req.body;
    if (!body || typeof body!=="object" || Array.isArray(body) ||
      !hasOnlyKnownKeys(body,new Set(["title","terms","expiresAt","childIds"])) ||
      !isNonEmptyString(body.title) || !isNonEmptyString(body.terms,5000) ||
      !Array.isArray(body.childIds) || !body.childIds.length ||
      new Set(body.childIds).size!==body.childIds.length ||
      !body.childIds.every(id=>isNonEmptyString(id) &&
        state.children.some(child=>child.id===id&&child.centreId===req.auth.centreId)) ||
      typeof body.expiresAt!=="string" || !/^\\d{4}-\\d{2}-\\d{2}T/.test(body.expiresAt) ||
      !Number.isFinite(Date.parse(body.expiresAt)) ||
      new Date(body.expiresAt).toISOString()!==body.expiresAt ||
      body.expiresAt<=new Date().toISOString()) {
      return res.status(400).json({error:"Invalid consent request"});
    }
    const request={id:nanoid(),centreId:req.auth.centreId,title:body.title.trim(),
      terms:body.terms.trim(),status:"draft",expiresAt:body.expiresAt,createdAt:new Date().toISOString(),publishedAt:null};
    consentStore.createRequest(request,body.childIds,consentAudit(req,"consent_request.created",request.id));
    return res.status(201).json(request);
  });

  app.post("/api/consent-requests/:id/publish",requireRoles(ROLE_TEACHER,ROLE_ADMIN),(req,res)=>{
    if (!consentStore) return res.status(503).json({error:"Consent request storage unavailable"});
    const result=consentStore.transitionRequest(req.params.id,req.auth.centreId,"published",
      new Date().toISOString(),consentAudit(req,"consent_request.published",req.params.id));
    if (result.error) return res.status(result.error==="not_found"?404:409).json({error:result.error});
    return res.json(result.value);
  });

  app.post("/api/consent-requests/:id/withdraw",requireRoles(ROLE_TEACHER,ROLE_ADMIN),(req,res)=>{
    if (!consentStore) return res.status(503).json({error:"Consent request storage unavailable"});
    const result=consentStore.transitionRequest(req.params.id,req.auth.centreId,"withdrawn",
      new Date().toISOString(),consentAudit(req,"consent_request.withdrawn",req.params.id));
    if (result.error) return res.status(result.error==="not_found"?404:409).json({error:result.error});
    return res.json(result.value);
  });

  app.get("/api/consents", requireRoles(ROLE_PARENT, ROLE_TEACHER, ROLE_ADMIN), (req, res) => {
    const submissions = (consentStore
      ? consentStore.list(req.auth.centreId, req.auth.role === ROLE_PARENT ? req.auth.userId : null)
      : state.consentSubmissions).filter((submission) => {
      if (submission.centreId !== req.auth.centreId) return false;
      if (req.auth.role === ROLE_PARENT) return submission.parentUserId === req.auth.userId;
      return true;
    });
    res.json(submissions);
  });

  app.post("/api/consents", requireRoles(ROLE_PARENT), (req, res) => {
    const parsed = validateConsentPayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (!parentOwnsChild(state, req.auth.centreId, req.auth.userId, parsed.value.childId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const child = state.children.find((entry) => entry.id === parsed.value.childId && entry.centreId === req.auth.centreId);
    const submission = {
      id: nanoid(),
      submittedAt: new Date().toISOString(),
      centreId: req.auth.centreId,
      parentUserId: req.auth.userId,
      child: child.name,
      ...parsed.value,
    };
    if (consentStore) {
      try {
        const result = consentStore.create(submission, {
          id: nanoid(), centreId: req.auth.centreId, time: submission.submittedAt,
          actorId: req.auth.userId, actorRole: req.auth.role,
          action: "consent.submitted", resourceType: "Consent", resourceId: submission.id,
        });
        if (result.error) return res.status(409).json({error:"Consent request unavailable, expired, withdrawn or not assigned to child"});
        submission.termsSnapshot=result.value.termsSnapshot;
      } catch (error) {
        if (error.code === "ERR_SQLITE_ERROR" && /UNIQUE constraint failed/.test(error.message)) {
          return res.status(409).json({ error: "Consent already submitted for this child and request" });
        }
        throw error;
      }
    } else {
      return res.status(503).json({error:"Consent request storage unavailable"});
      if (state.consentSubmissions.some((entry) => entry.centreId === submission.centreId &&
        entry.childId === submission.childId && entry.consentRequestId === submission.consentRequestId)) {
        return res.status(409).json({ error: "Consent already submitted for this child and request" });
      }
      state.consentSubmissions.unshift(submission);
      audit(state, "Parent", `Submitted consent for ${submission.child || "child"}`, req.auth.centreId, "Consent");
    }
    return res.status(201).json(submission);
  });

  const extractionUsage = new Map();
  app.post("/api/ai/extract", requireRoles(ROLE_TEACHER, ROLE_ADMIN), (req, res) => {
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim() || message.length > 4000) {
      return res.status(400).json({ error: "Message must be 1–4000 characters" });
    }
    const now = Date.now();
    const key = `${req.auth.centreId}:${req.auth.userId}`;
    const usage = extractionUsage.get(key);
    if (usage && now - usage.start < 60_000 && usage.count >= 10) {
      return res.status(429).json({ error: "AI extraction rate limit exceeded" });
    }
    extractionUsage.set(key, !usage || now - usage.start >= 60_000
      ? { start: now, count: 1 }
      : { start: usage.start, count: usage.count + 1 });
    const centreSettings = state.settingsByCentre[req.auth.centreId];
    const result = demoExtract(message, centreSettings);
    audit(state, "AI Service", `Generated ${result.tasks.length} extraction draft(s)`, req.auth.centreId, "AI", "Medium");
    return res.json({ ...result, requiresApproval: true });
  });

  app.get("/api/audit", requireRoles(ROLE_ADMIN), (req, res) => {
    if (taskStore) return res.json(taskStore.listAudit(req.auth.centreId));
    return res.json(state.auditEvents.filter((event) => event.centreId === req.auth.centreId || event.centreId === "system"));
  });

  app.get("/api/settings", requireRoles(ROLE_ADMIN), (req, res) => {
    const settings = state.settingsByCentre[req.auth.centreId];
    if (!settings) return res.status(404).json({ error: "Settings not found" });
    return res.json(settings);
  });

  app.patch("/api/settings", requireRoles(ROLE_ADMIN), (req, res) => {
    const settings = state.settingsByCentre[req.auth.centreId];
    if (!settings) return res.status(404).json({ error: "Settings not found" });
    const parsed = validateSettingsPatchPayload(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (parsed.value.notificationChannels) {
      settings.notificationChannels = { ...settings.notificationChannels, ...parsed.value.notificationChannels };
      delete parsed.value.notificationChannels;
    }
    Object.assign(settings, parsed.value);
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
