import { formatDisplayDate, todayLocalISO } from "./dates.js";
import { dueInDays } from "./taskModel.js";

const plural = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;

// The viewer's local calendar date for an ISO timestamp (tests may inject a deterministic version).
export const localDateOf = (iso) => (Number.isNaN(Date.parse(iso)) ? "" : todayLocalISO(new Date(iso)));

/** Deadline badge for a saved task: {tone: danger|warn|info|neutral|ok, label}. Never colour alone: the label says it too. */
export function taskBadge(task, today, toLocalDate = localDateOf) {
  if (task.status === "done") {
    const when = task.completedAt ? formatDisplayDate(toLocalDate(task.completedAt)) : "";
    return { tone: "ok", label: when ? `Completed ${when}` : "Completed" };
  }
  if (!task.dueDate) return { tone: "neutral", label: "No deadline" };
  const days = dueInDays(task, today);
  if (days < 0) return { tone: "danger", label: `Overdue by ${plural(-days, "day")}` };
  if (days === 0) return { tone: "warn", label: "Due today" };
  if (days === 1) return { tone: "warn", label: "Due tomorrow" };
  return { tone: "info", label: `Due ${formatDisplayDate(task.dueDate)}` };
}

/** Deadline badge for a draft under review. */
export function draftBadge(draft) {
  switch (draft.dateStatus) {
    case "ambiguous": return { tone: "warn", label: "Check deadline" };
    case "resolved": return { tone: "ok", label: `From “${draft.dateExpression}”` };
    case "confirmed": return { tone: "info", label: "Set by you" };
    default: return { tone: "neutral", label: draft.dateExpression ? "No deadline (removed)" : "No deadline found" };
  }
}

/** Saved tasks grouped by the day they were saved (newest first). Built only from stored tasks. */
export function groupHistory(tasks, { toLocalDate = localDateOf } = {}) {
  const days = new Map();
  for (const task of tasks) {
    const day = toLocalDate(task.createdAt) || "unknown";
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(task);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, list]) => ({ date, tasks: [...list].sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0)) }));
}

// A single-line preview of a source sentence for a collapsed summary.
export function previewText(text, max = 70) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
