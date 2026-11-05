import { classifyTasks, ownerLabel } from "./taskModel.js";
import { formatDisplayDate } from "./dates.js";

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g;
const oneLine = (value) => String(value ?? "").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();

// Task text comes from pasted messages, so it is untrusted. When it is copied into other tools it
// must not turn into links, images, HTML, headings or extra list items.
export function escapeMarkdown(value) {
  return oneLine(value)
    .replace(/[\\`*_{}\[\]<>|~]/g, "\\$&")
    .replace(/^(#{1,6}|[-+]|\d+[.)]|>)(?=\s|$)/, "\\$1")
    .replace(/&(?=#?\w+;)/g, "&amp;")
    .replace(/!(?=\[|\\\[)/g, "\\!")
    .replace(/(https?|ftp|file|javascript|data|vbscript):/gi, "$1\\:")
    .replace(/\bwww\./gi, "www\\."); // GitHub-style Markdown also auto-links bare www. addresses
}

function details(task, today) {
  const parts = [];
  const owner = ownerLabel(task.owner);
  if (owner) parts.push(`Owner: ${owner}`);
  if (task.dueDate) {
    const overdue = task.status === "open" && task.dueDate < today;
    parts.push(`Due: ${formatDisplayDate(task.dueDate)}${overdue ? " (overdue)" : ""}`);
  }
  return parts;
}

const SECTIONS = [["overdue", "Overdue"], ["upcoming", "Upcoming"], ["undated", "No deadline"], ["completed", "Completed"]];

function build(tasks, { today, includeCompleted = false, includeSource = false }, markdown) {
  const groups = classifyTasks(tasks, today);
  const lines = [];
  const sections = SECTIONS.filter(([key]) => key !== "completed" || includeCompleted).filter(([key]) => groups[key].length > 0);
  if (markdown) lines.push("# Tasks", "");
  else lines.push("TASKS", "");
  if (sections.length === 0) { lines.push("No tasks."); return lines.join("\n") + "\n"; }
  for (const [key, heading] of sections) {
    lines.push(markdown ? `## ${heading}` : `${heading.toUpperCase()}`);
    for (const task of groups[key]) {
      const meta = details(task, today);
      const text = markdown ? escapeMarkdown(task.title) : oneLine(task.title);
      const suffix = meta.length ? ` (${markdown ? meta.map(escapeMarkdown).join("; ") : meta.map(oneLine).join("; ")})` : "";
      const box = key === "completed" ? "[x]" : "[ ]";
      lines.push(`${markdown ? "- " : "- "}${box} ${text}${suffix}`);
      if (includeSource && task.sourceSnippet) {
        lines.push(markdown ? `  > ${escapeMarkdown(task.sourceSnippet)}` : `    Source: ${oneLine(task.sourceSnippet)}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").replace(/\n+$/, "\n");
}

export const toMarkdown = (tasks, options) => build(tasks, options, true);
export const toPlainText = (tasks, options) => build(tasks, options, false);
