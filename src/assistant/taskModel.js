import { addDays, compareISO, isValidISODate } from "./dates.js";
import { MAX_OWNER_CHARS, MAX_SNIPPET_CHARS, MAX_TITLE_CHARS } from "./extractor.js";

export const MAX_STORED_TASKS = 500;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const clean = (value, max) => (typeof value === "string" ? value.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

// ── Owners ───────────────────────────────────────────────────────────────────

// "me" and "myself" mean the user; any other text names another person.
export function parseOwnerInput(value) {
  const name = clean(value, MAX_OWNER_CHARS);
  if (!name) return { kind: "unassigned", name: "" };
  if (/^(?:me|myself)$/i.test(name)) return { kind: "me", name: "" };
  return { kind: "other", name };
}

export function ownerLabel(owner) {
  if (owner?.kind === "me") return "Me";
  if (owner?.kind === "other" && owner.name) return owner.name;
  return "";
}

// ── Review drafts ────────────────────────────────────────────────────────────

export function editDraft(draft, patch) {
  const next = { ...draft };
  // Keep raw typing (a trimmed value would stop people typing spaces); confirmDrafts() cleans it.
  if (Object.hasOwn(patch, "title")) next.title = typeof patch.title === "string" ? patch.title.replace(CONTROL_CHARS, "").replace(/[\r\n\t]/g, " ").slice(0, MAX_TITLE_CHARS) : "";
  if (Object.hasOwn(patch, "ownerText")) next.owner = parseOwnerInput(patch.ownerText);
  if (Object.hasOwn(patch, "dueDate")) {
    if (patch.dueDate === null || patch.dueDate === "") {
      next.dueDate = null;
      next.dateStatus = "none"; // an explicit "no deadline" decision
      next.dateCandidates = [];
    } else if (isValidISODate(patch.dueDate)) {
      next.dueDate = patch.dueDate;
      next.dateStatus = "confirmed"; // the user chose this date
      next.dateCandidates = [];
    }
  }
  return next;
}

export function assignToMe(draft) {
  return { ...draft, owner: { kind: "me", name: "" } };
}

// The text field is hidden from the title check so the user sees why Save is disabled.
export function draftProblems(draft) {
  const problems = [];
  if (!clean(draft.title, MAX_TITLE_CHARS)) problems.push("Add a title.");
  if (draft.dateStatus === "ambiguous") problems.push("Choose a deadline or select “No deadline”.");
  return problems;
}

export function confirmationProblems(drafts) {
  if (drafts.length === 0) return ["There are no tasks to save."];
  const problems = [];
  drafts.forEach((draft, index) => {
    for (const problem of draftProblems(draft)) problems.push(`Task ${index + 1}: ${problem}`);
  });
  return problems;
}

let counter = 0;
export function newTaskId() {
  counter += 1;
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `task-${random}-${counter}`;
}

/**
 * Turns reviewed drafts into saved tasks. Only the short supporting excerpt is kept (and only if
 * keepSnippets is true); the full original message is never part of a saved task.
 */
export function confirmDrafts(drafts, { now = new Date(), messageDate, extractorId, keepSnippets = true, idFactory = newTaskId } = {}) {
  const problems = confirmationProblems(drafts);
  if (problems.length) throw new Error(problems[0]);
  const createdAt = (now instanceof Date ? now : new Date(now)).toISOString();
  return drafts.map((draft) => ({
    id: idFactory(),
    title: clean(draft.title, MAX_TITLE_CHARS),
    owner: draft.owner?.kind === "me" ? { kind: "me", name: "" } : draft.owner?.kind === "other" && draft.owner.name
      ? { kind: "other", name: clean(draft.owner.name, MAX_OWNER_CHARS) } : { kind: "unassigned", name: "" },
    dueDate: isValidISODate(draft.dueDate) ? draft.dueDate : null,
    status: "open",
    completedAt: null,
    createdAt,
    messageDate: isValidISODate(messageDate) ? messageDate : null,
    sourceSnippet: keepSnippets ? clean(draft.sourceSnippet, MAX_SNIPPET_CHARS) : "",
    dateExpression: keepSnippets ? clean(draft.dateExpression, 100) || null : null,
    extractorId: clean(extractorId, 60) || "unknown",
  }));
}

// ── Saved tasks ──────────────────────────────────────────────────────────────

const sameTask = (a, b) => a.status === "open" && b.status === "open" && a.title.toLowerCase() === b.title.toLowerCase() &&
  a.dueDate === b.dueDate && ownerLabel(a.owner).toLowerCase() === ownerLabel(b.owner).toLowerCase();

export function mergeTasks(existing, incoming) {
  const tasks = [...existing];
  let skippedDuplicates = 0;
  let rejectedForLimit = 0;
  for (const task of incoming) {
    if (tasks.some((t) => sameTask(t, task))) { skippedDuplicates += 1; continue; }
    if (tasks.length >= MAX_STORED_TASKS) { rejectedForLimit += 1; continue; }
    tasks.push(task);
  }
  return { tasks, added: tasks.length - existing.length, skippedDuplicates, rejectedForLimit };
}

export function setTaskStatus(tasks, id, status, now = new Date()) {
  if (status !== "open" && status !== "done") return tasks;
  return tasks.map((task) => (task.id !== id ? task : {
    ...task, status, completedAt: status === "done" ? (now instanceof Date ? now : new Date(now)).toISOString() : null,
  }));
}

export function removeTask(tasks, id) {
  return tasks.filter((task) => task.id !== id);
}

/** Groups tasks for display, using the viewer's local "today" (ISO date). */
export function classifyTasks(tasks, today) {
  const open = tasks.filter((t) => t.status === "open");
  const byDue = (a, b) => compareISO(a.dueDate, b.dueDate) || compareISO(a.createdAt, b.createdAt);
  return {
    overdue: open.filter((t) => t.dueDate && compareISO(t.dueDate, today) < 0).sort(byDue),
    upcoming: open.filter((t) => t.dueDate && compareISO(t.dueDate, today) >= 0).sort(byDue),
    undated: open.filter((t) => !t.dueDate).sort((a, b) => compareISO(a.createdAt, b.createdAt)),
    completed: tasks.filter((t) => t.status === "done").sort((a, b) => compareISO(b.completedAt ?? "", a.completedAt ?? "")),
  };
}

export function dueInDays(task, today) {
  if (!task.dueDate) return null;
  return Math.round((Date.parse(`${task.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

// Stored data is untrusted (it can be edited in dev tools or written by another version): rebuild
// every task from known fields and drop anything that does not validate.
export function sanitizeStoredTask(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = clean(raw.title, MAX_TITLE_CHARS);
  const id = clean(raw.id, 80);
  if (!title || !id) return null;
  const status = raw.status === "done" ? "done" : "open";
  const kind = raw.owner?.kind;
  const name = clean(raw.owner?.name, MAX_OWNER_CHARS);
  const createdAt = typeof raw.createdAt === "string" && !Number.isNaN(Date.parse(raw.createdAt)) ? new Date(raw.createdAt).toISOString() : new Date(0).toISOString();
  const completedAt = status === "done" && typeof raw.completedAt === "string" && !Number.isNaN(Date.parse(raw.completedAt))
    ? new Date(raw.completedAt).toISOString() : null;
  return {
    id, title,
    owner: kind === "me" ? { kind: "me", name: "" } : kind === "other" && name ? { kind: "other", name } : { kind: "unassigned", name: "" },
    dueDate: isValidISODate(raw.dueDate) ? raw.dueDate : null,
    status, completedAt, createdAt,
    messageDate: isValidISODate(raw.messageDate) ? raw.messageDate : null,
    sourceSnippet: clean(raw.sourceSnippet, MAX_SNIPPET_CHARS),
    dateExpression: clean(raw.dateExpression, 100) || null,
    extractorId: clean(raw.extractorId, 60) || "unknown",
  };
}

export { addDays };
