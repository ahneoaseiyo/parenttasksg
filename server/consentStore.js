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
  if (version < 4) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE consent_requests (
        id TEXT PRIMARY KEY,
        centre_id TEXT NOT NULL,
        title TEXT NOT NULL,
        terms TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft','published','withdrawn')),
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        published_at TEXT
      );
      CREATE INDEX idx_consent_requests_centre ON consent_requests(centre_id,status);
      CREATE TABLE consent_request_children (
        request_id TEXT NOT NULL,
        centre_id TEXT NOT NULL,
        child_id TEXT NOT NULL,
        PRIMARY KEY(request_id,child_id),
        FOREIGN KEY(request_id) REFERENCES consent_requests(id)
      );
      ALTER TABLE consent_submissions ADD COLUMN terms_snapshot TEXT;
      INSERT INTO schema_migrations(version) VALUES (4);`);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  }
  const insertAudit = (event) => db.prepare(`INSERT INTO audit_events
    (id,centre_id,time,actor_id,actor_role,action,resource_type,resource_id)
    VALUES (?,?,?,?,?,?,?,?)`).run(event.id,event.centreId,event.time,event.actorId,
      event.actorRole,event.action,event.resourceType,event.resourceId);
  const requestSelect = `SELECT id,centre_id AS centreId,title,terms,status,
    expires_at AS expiresAt,created_at AS createdAt,published_at AS publishedAt
    FROM consent_requests`;
  const select = `SELECT id,centre_id AS centreId,parent_user_id AS parentUserId,
    child_id AS childId,child,consent_request_id AS consentRequestId,decision,notes,
    submitted_at AS submittedAt,terms_snapshot AS termsSnapshot FROM consent_submissions`;
  return {
    listRequests(centreId,childIds) {
      if (childIds === null) return db.prepare(requestSelect+" WHERE centre_id=? ORDER BY created_at DESC").all(centreId);
      if (!childIds.length) return [];
      return db.prepare(requestSelect+` WHERE centre_id=? AND status='published'
        AND id IN (SELECT request_id FROM consent_request_children WHERE centre_id=?
        AND child_id IN (${childIds.map(()=>"?").join(",")})) ORDER BY created_at DESC`)
        .all(centreId,centreId,...childIds);
    },
    createRequest(request,childIds,event) {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(`INSERT INTO consent_requests
          (id,centre_id,title,terms,status,expires_at,created_at,published_at)
          VALUES (?,?,?,?,'draft',?,?,NULL)`).run(request.id,request.centreId,
          request.title,request.terms,request.expiresAt,request.createdAt);
        const insertChild=db.prepare(`INSERT INTO consent_request_children
          (request_id,centre_id,child_id) VALUES (?,?,?)`);
        for (const childId of childIds) insertChild.run(request.id,request.centreId,childId);
        insertAudit(event);
        db.exec("COMMIT");
        return request;
      } catch(error) { db.exec("ROLLBACK"); throw error; }
    },
    transitionRequest(id,centreId,status,time,event) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const request=db.prepare(requestSelect+" WHERE id=? AND centre_id=?").get(id,centreId);
        if (!request) { db.exec("ROLLBACK"); return {error:"not_found"}; }
        if (status==="published" && request.status!=="draft") { db.exec("ROLLBACK"); return {error:"conflict"}; }
        if (status==="withdrawn" && request.status!=="published") { db.exec("ROLLBACK"); return {error:"conflict"}; }
        if (status==="published" && request.expiresAt<=time) { db.exec("ROLLBACK"); return {error:"expired"}; }
        db.prepare("UPDATE consent_requests SET status=?,published_at=CASE WHEN ?='published' THEN ? ELSE published_at END WHERE id=? AND centre_id=?")
          .run(status,status,time,id,centreId);
        insertAudit(event);
        db.exec("COMMIT");
        return {value:db.prepare(requestSelect+" WHERE id=? AND centre_id=?").get(id,centreId)};
      } catch(error) { db.exec("ROLLBACK"); throw error; }
    },
    list(centreId,parentUserId) {
      return parentUserId
        ? db.prepare(select+" WHERE centre_id=? AND parent_user_id=? ORDER BY submitted_at DESC LIMIT 500").all(centreId,parentUserId)
        : db.prepare(select+" WHERE centre_id=? ORDER BY submitted_at DESC LIMIT 500").all(centreId);
    },
    create(submission,event) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const request=db.prepare(`SELECT r.terms FROM consent_requests r
          JOIN consent_request_children rc ON rc.request_id=r.id AND rc.centre_id=r.centre_id
          WHERE r.id=? AND r.centre_id=? AND rc.child_id=? AND r.status='published'
          AND r.expires_at>?`).get(submission.consentRequestId,submission.centreId,
            submission.childId,submission.submittedAt);
        if (!request) { db.exec("ROLLBACK"); return {error:"request_unavailable"}; }
        db.prepare(`INSERT INTO consent_submissions
          (id,centre_id,parent_user_id,child_id,child,consent_request_id,decision,notes,submitted_at,terms_snapshot)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(submission.id,submission.centreId,submission.parentUserId,
          submission.childId,submission.child,submission.consentRequestId,submission.decision??null,
          submission.notes??null,submission.submittedAt,request.terms);
        insertAudit(event);
        db.exec("COMMIT");
        return {value:{...submission,termsSnapshot:request.terms}};
      } catch(error) { db.exec("ROLLBACK"); throw error; }
    },
    close() { db.close(); },
  };
}
