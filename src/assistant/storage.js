import { MAX_STORED_TASKS, sanitizeStoredTask } from "./taskModel.js";

export const STORAGE_KEY = "message-task.v1";
const VERSION = 1;

// Returns window.localStorage if it really works (it can throw or be full in private/sandboxed modes).
export function getBrowserStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = "__message-task-probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/**
 * Local-only task persistence. Only confirmed tasks are written; the pasted message text and
 * unconfirmed drafts never reach storage. Reads are validated because stored data is untrusted.
 */
export function createTaskStorage(storage = getBrowserStorage(), key = STORAGE_KEY) {
  return {
    available: Boolean(storage),
    load() {
      if (!storage) return { tasks: [], problem: "unavailable" };
      let text;
      try { text = storage.getItem(key); } catch { return { tasks: [], problem: "unavailable" }; }
      if (text === null) return { tasks: [], problem: null };
      let parsed;
      try { parsed = JSON.parse(text); } catch { return { tasks: [], problem: "unreadable" }; }
      if (!parsed || typeof parsed !== "object" || parsed.version !== VERSION || !Array.isArray(parsed.tasks)) {
        return { tasks: [], problem: "unreadable" };
      }
      const seen = new Set();
      const tasks = [];
      for (const raw of parsed.tasks.slice(0, MAX_STORED_TASKS)) {
        const task = sanitizeStoredTask(raw);
        if (task && !seen.has(task.id)) { seen.add(task.id); tasks.push(task); }
      }
      return { tasks, problem: tasks.length < parsed.tasks.length ? "partial" : null };
    },
    save(tasks) {
      if (!storage) return { ok: false, error: "Browser storage is unavailable, so tasks will be lost when this tab closes." };
      try {
        storage.setItem(key, JSON.stringify({ version: VERSION, tasks }));
        return { ok: true, error: null };
      } catch {
        return { ok: false, error: "Browser storage is full or blocked. Your latest change was not saved." };
      }
    },
    clear() {
      if (!storage) return { ok: true };
      try { storage.removeItem(key); return { ok: true }; } catch { return { ok: false }; }
    },
  };
}
