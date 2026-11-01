import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

// Development-only roster. The identity provider and enrolment verification are future work.
export function openRosterStore(filePath, seedChildren=[], seedLinks=[]) {
  const db=new DatabaseSync(resolve(filePath));
  db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  const version=db.prepare("SELECT COALESCE(MAX(version),0) AS version FROM schema_migrations").get().version;
  if(version<5) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(`CREATE TABLE roster_children (
        id TEXT NOT NULL,
        centre_id TEXT NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY(centre_id,id)
      );
      CREATE TABLE roster_parent_links (
        centre_id TEXT NOT NULL,
        parent_user_id TEXT NOT NULL,
        child_id TEXT NOT NULL,
        PRIMARY KEY(centre_id,parent_user_id,child_id),
        FOREIGN KEY(centre_id,child_id) REFERENCES roster_children(centre_id,id)
      );
      CREATE INDEX idx_roster_parent ON roster_parent_links(centre_id,parent_user_id);
      INSERT INTO schema_migrations(version) VALUES (5);`);
      db.exec("COMMIT");
    } catch(error){db.exec("ROLLBACK");db.close();throw error;}
  }
  const count=db.prepare("SELECT COUNT(*) AS count FROM roster_children").get().count;
  if(count===0 && seedChildren.length) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const addChild=db.prepare("INSERT INTO roster_children(id,centre_id,name) VALUES (?,?,?)");
      const addLink=db.prepare("INSERT INTO roster_parent_links(centre_id,parent_user_id,child_id) VALUES (?,?,?)");
      for(const child of seedChildren) addChild.run(child.id,child.centreId,child.name);
      for(const link of seedLinks) addLink.run(link.centreId,link.parentUserId,link.childId);
      db.exec("COMMIT");
    } catch(error){db.exec("ROLLBACK");db.close();throw error;}
  }
  return {
    child(centreId,childId) {
      return db.prepare("SELECT id,centre_id AS centreId,name FROM roster_children WHERE centre_id=? AND id=?").get(centreId,childId);
    },
    childrenForParent(centreId,parentUserId) {
      return db.prepare(`SELECT c.id,c.centre_id AS centreId,c.name FROM roster_children c
        JOIN roster_parent_links p ON p.centre_id=c.centre_id AND p.child_id=c.id
        WHERE p.centre_id=? AND p.parent_user_id=?`).all(centreId,parentUserId);
    },
    ownsChild(centreId,parentUserId,childId) {
      return !!db.prepare(`SELECT 1 FROM roster_parent_links WHERE centre_id=?
        AND parent_user_id=? AND child_id=?`).get(centreId,parentUserId,childId);
    },
    close(){db.close();}
  };
}
