import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

export function openConsentStore(filePath) {
  const db = new DatabaseSync(resolve(filePath));
  db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
  const version = db.prepare("SELECT COALESCE(MAX(version),0) AS version FROM schema_migrations").get().version;
  if (version < 3) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE consent_submissions (
        id TEXT PRIMARY KEY,
        centre_id TEXT NOT NULL,
        parent_user_id TEXT NOT NULL,
        child_id TEXT NOT NULL,
        child TEXT NOT NULL,
        consent_request_id TEXT NOT NULL,
        decision TEXT,
        notes TEXT,
        submitted_at TEXT NOT NULL,
        UNIQUE(centre_id,child_id,consent_request_id)
      );
      CREATE INDEX idx_consent_parent ON consent_submissions(centre_id,parent_user_id);
      INSERT INTO schema_migrations(version) VALUES (3);`);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  }
  const select = `SELECT id,centre_id AS centreId,parent_user_id AS parentUserId,
    child_id AS childId,child,consent_request_id AS consentRequestId,decision,notes,
    submitted_at AS submittedAt FROM consent_submissions`;
  return {
    list(centreId,parentUserId) {
      return parentUserId
        ? db.prepare(select+" WHERE centre_id=? AND parent_user_id=? ORDER BY submitted_at DESC LIMIT 500").all(centreId,parentUserId)
        : db.prepare(select+" WHERE centre_id=? ORDER BY submitted_at DESC LIMIT 500").all(centreId);
    },
    create(submission,event) {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(`INSERT INTO consent_submissions
          (id,centre_id,parent_user_id,child_id,child,consent_request_id,decision,notes,submitted_at)
          VALUES (?,?,?,?,?,?,?,?,?)`).run(submission.id,submission.centreId,submission.parentUserId,
          submission.childId,submission.child,submission.consentRequestId,submission.decision??null,
          submission.notes??null,submission.submittedAt);
        db.prepare(`INSERT INTO audit_events
          (id,centre_id,time,actor_id,actor_role,action,resource_type,resource_id)
          VALUES (?,?,?,?,?,?,?,?)`).run(event.id,event.centreId,event.time,event.actorId,event.actorRole,
          event.action,event.resourceType,event.resourceId);
        db.exec("COMMIT");
        return submission;
      } catch(error) { db.exec("ROLLBACK"); throw error; }
    },
    close() { db.close(); },
  };
}
