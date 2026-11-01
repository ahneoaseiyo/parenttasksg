import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Local-development persistence only. SQLite is not a production deployment decision.
export function openTaskStore(filePath, seedTasks = []) {
  if (!filePath || typeof filePath !== "string") throw new TypeError("Database path required");
  const path = resolve(filePath);
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY
  )`);
  const version = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get().version || 0;
  if (version < 1) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        centre_id TEXT NOT NULL,
        parent_user_id TEXT NOT NULL,
        child TEXT NOT NULL,
        level TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('Done','Not done')),
        priority TEXT NOT NULL,
        due_label TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_centre_parent ON tasks(centre_id,parent_user_id);
      INSERT INTO schema_migrations(version) VALUES (1);`);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  }
  if (version < 2) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        centre_id TEXT NOT NULL,
        time TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL
      );
      CREATE INDEX idx_audit_centre_time ON audit_events(centre_id,time DESC);
      INSERT INTO schema_migrations(version) VALUES (2);`);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  }
  const insertAudit = db.prepare(`INSERT INTO audit_events
    (id,centre_id,time,actor_id,actor_role,action,resource_type,resource_id)
    VALUES (?,?,?,?,?,?,?,?)`);
  function writeAudit(event) {
    insertAudit.run(event.id,event.centreId,event.time,event.actorId,event.actorRole,event.action,event.resourceType,event.resourceId);
  }
  function transaction(work) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const count = db.prepare("SELECT COUNT(*) AS count FROM tasks").get().count;
  if (count === 0 && seedTasks.length) {
    const insert = db.prepare(`INSERT INTO tasks
      (id,centre_id,parent_user_id,child,level,title,category,status,priority,due_label)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const task of seedTasks) insert.run(task.id,task.centreId,task.parentUserId,task.child,task.level,task.title,task.category,task.status,task.priority,task.dueLabel);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  }
  const select = `SELECT id,centre_id AS centreId,parent_user_id AS parentUserId,
    child,level,title,category,status,priority,due_label AS dueLabel FROM tasks`;
  return {
    list(centreId, parentUserId) {
      return parentUserId
        ? db.prepare(select + " WHERE centre_id=? AND parent_user_id=? ORDER BY rowid DESC").all(centreId,parentUserId)
        : db.prepare(select + " WHERE centre_id=? ORDER BY rowid DESC").all(centreId);
    },
    get(id) { return db.prepare(select + " WHERE id=?").get(id); },
    create(task, event) {
      db.prepare(`INSERT INTO tasks (id,centre_id,parent_user_id,child,level,title,category,status,priority,due_label)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(task.id,task.centreId,task.parentUserId,task.child,task.level,task.title,task.category,task.status,task.priority,task.dueLabel);
      return this.get(task.id);
    },
    update(id, patch, event) {
      const fields = { child:"child", level:"level", title:"title", category:"category", status:"status", priority:"priority", dueLabel:"due_label" };
      const keys = Object.keys(patch);
      if (!keys.length || keys.some(key => !fields[key])) throw new TypeError("Invalid task patch");
      db.prepare("UPDATE tasks SET " + keys.map(key => fields[key] + "=?").join(",") + " WHERE id=?").run(...keys.map(key => patch[key]),id);
      return this.get(id);
    },
    listAudit(centreId) {
      return db.prepare(`SELECT id,centre_id AS centreId,time,actor_id AS actorId,
        actor_role AS actorRole,action,resource_type AS resourceType,
        resource_id AS resourceId FROM audit_events WHERE centre_id=?
        ORDER BY time DESC,id DESC LIMIT 500`).all(centreId);
    },
    close() { db.close(); },
  };
}
