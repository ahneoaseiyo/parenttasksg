import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

// School-controlled identity registry. Never derive roles or centres from token claims.
export function openIdentityStore(filePath) {
  const db = new DatabaseSync(resolve(filePath));
  db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  const version = db.prepare("SELECT COALESCE(MAX(version),0) AS version FROM schema_migrations").get().version;
  if (version < 6) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE identity_principals (
        user_id TEXT NOT NULL,
        centre_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('parent','teacher','admin')),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        PRIMARY KEY(user_id,centre_id)
      );
      CREATE TABLE identity_subjects (
        issuer TEXT NOT NULL,
        subject TEXT NOT NULL,
        user_id TEXT NOT NULL,
        centre_id TEXT NOT NULL,
        PRIMARY KEY(issuer,subject),
        FOREIGN KEY(user_id,centre_id) REFERENCES identity_principals(user_id,centre_id)
      );
      INSERT INTO schema_migrations(version) VALUES (6);`);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  }
  const find = db.prepare(`SELECT p.user_id AS userId,p.centre_id AS centreId,p.role
    FROM identity_subjects s JOIN identity_principals p
    ON p.user_id=s.user_id AND p.centre_id=s.centre_id
    WHERE s.issuer=? AND s.subject=? AND p.active=1`);
  const parent = db.prepare("SELECT 1 FROM identity_principals WHERE centre_id=? AND user_id=? AND role='parent' AND active=1");
  return {
    resolve(issuer, subject) { const row=find.get(issuer, subject); return row ? {userId:row.userId,centreId:row.centreId,role:row.role} : null; },
    isActiveParent(centreId, userId) { return !!parent.get(centreId,userId); },
    provision({issuer,subject,userId,centreId,role},event) {
      if (![issuer,subject,userId,centreId].every(x=>typeof x==="string" && x.length>0 && x.length<=256) ||
          !["parent","teacher","admin"].includes(role)) throw new Error("Invalid identity");
      if (!event || !event.id || !event.actorId || event.actorRole!=="admin" || event.centreId!==centreId)
        throw new Error("Administrator audit required");
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(`INSERT INTO identity_principals(user_id,centre_id,role,active) VALUES (?,?,?,1)
          ON CONFLICT(user_id,centre_id) DO UPDATE SET role=excluded.role,active=1`).run(userId,centreId,role);
        db.prepare("INSERT INTO identity_subjects(issuer,subject,user_id,centre_id) VALUES (?,?,?,?)").run(issuer,subject,userId,centreId);
        db.prepare(`INSERT INTO audit_events(id,centre_id,time,actor_id,actor_role,action,resource_type,resource_id)
          VALUES (?,?,?,?,?,?,?,?)`).run(event.id,centreId,event.time,event.actorId,event.actorRole,"identity.provisioned","Identity",userId);
        db.exec("COMMIT");
      } catch(error) {db.exec("ROLLBACK");throw error;}
    },
    bootstrapAdministrator({issuer,subject,userId,centreId},event) {
      if (![issuer,subject,userId,centreId].every(x=>typeof x==="string" && x.trim().length>0 && x.length<=256) ||
          !event || !event.id || !event.time || event.actorId!=="local-bootstrap" ||
          event.actorRole!=="system" || event.centreId!==centreId)
        throw new Error("Invalid bootstrap request");
      db.exec("BEGIN IMMEDIATE");
      try {
        const existing=db.prepare("SELECT 1 FROM identity_principals WHERE centre_id=? LIMIT 1").get(centreId);
        if (existing) throw new Error("Centre already initialized");
        db.prepare("INSERT INTO identity_principals(user_id,centre_id,role,active) VALUES (?,?,?,1)")
          .run(userId,centreId,"admin");
        db.prepare("INSERT INTO identity_subjects(issuer,subject,user_id,centre_id) VALUES (?,?,?,?)")
          .run(issuer,subject,userId,centreId);
        db.prepare(`INSERT INTO audit_events(id,centre_id,time,actor_id,actor_role,action,resource_type,resource_id)
          VALUES (?,?,?,?,?,?,?,?)`).run(event.id,centreId,event.time,event.actorId,event.actorRole,
          "identity.bootstrap_admin","Identity",userId);
        db.exec("COMMIT");
      } catch(error) {db.exec("ROLLBACK");throw error;}
    },
    deactivate(centreId,userId,event) {
      if (!event || event.actorRole!=="admin" || event.centreId!==centreId) throw new Error("Administrator audit required");
      db.exec("BEGIN IMMEDIATE");
      try {
        const result=db.prepare("UPDATE identity_principals SET active=0 WHERE centre_id=? AND user_id=?").run(centreId,userId);
        if (result.changes) db.prepare(`INSERT INTO audit_events(id,centre_id,time,actor_id,actor_role,action,resource_type,resource_id)
          VALUES (?,?,?,?,?,?,?,?)`).run(event.id,centreId,event.time,event.actorId,"admin","identity.deactivated","Identity",userId);
        db.exec("COMMIT");
        return result.changes>0;
      } catch(error) {db.exec("ROLLBACK");throw error;}
    },
    close(){db.close();}
  };
}
