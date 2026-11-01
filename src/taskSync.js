// Converts server-owned task records into the existing checklist presentation model.
// The server remains authoritative for IDs, ownership and status.
export function toChecklistTask(record) {
  if (!record || typeof record.id !== "string" || typeof record.title !== "string") {
    throw new TypeError("Invalid task record");
  }
  return {
    id: record.id,
    child: record.child || "Unknown child",
    level: record.level || "",
    title: record.title,
    source: "School task",
    dueLabel: record.dueLabel || "Upcoming",
    category: record.category || "Reminder",
    status: record.status === "Done" ? "Done" : "Not done",
    sharedWith: [],
    priority: record.priority || "Medium",
  };
}

export async function loadVerifiedTasks(api, options) {
  const records = await api.listTasks(options);
  if (!Array.isArray(records)) throw new TypeError("Invalid task list");
  return records.map(toChecklistTask);
}

export async function saveVerifiedStatus(api, task) {
  if (!task || task.category === "Consent form") {
    throw new TypeError("Consent cannot be completed through the checklist");
  }
  const next = task.status === "Done" ? "Not done" : "Done";
  const confirmed = await api.updateTaskStatus(task.id, next);
  if (!confirmed || confirmed.id !== task.id || confirmed.status !== next) {
    throw new Error("Server did not confirm task update");
  }
  return toChecklistTask(confirmed);
}
