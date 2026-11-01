import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { openTaskStore } from "./taskStore.js";
import { openIdentityStore } from "./identityStore.js";

// Explicit offline operator action only. Never expose bootstrap over HTTP.
export function bootstrapAdministrator({dbPath,issuer,subject,userId,centreId}) {
  if (!dbPath || ![issuer,subject,userId,centreId].every(x=>typeof x==="string" && x.trim().length>0))
    throw new Error("Database path, issuer, subject, user ID and centre ID are required");
  const path=resolve(dbPath);
  if (!statSync(path,{throwIfNoEntry:false})?.isFile())
    throw new Error("Existing initialized SQLite database required");
  const task=openTaskStore(path,[]);
  let identities;
  try {
    identities=openIdentityStore(path);
    identities.bootstrapAdministrator({issuer,subject,userId,centreId},{
      id:randomUUID(),centreId,time:new Date().toISOString(),
      actorId:"local-bootstrap",actorRole:"system"
    });
  } finally {identities?.close();task.close();}
}

if (process.argv[1] && resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
  const [dbPath,issuer,subject,userId,centreId]=process.argv.slice(2);
  try {
    if (process.env.ALLOW_LOCAL_ADMIN_BOOTSTRAP!=="yes")
      throw new Error("Set ALLOW_LOCAL_ADMIN_BOOTSTRAP=yes for an intentional local operator action");
    bootstrapAdministrator({dbPath,issuer,subject,userId,centreId});
    process.stdout.write("Administrator bootstrap completed for centre "+centreId+"\\n");
  } catch(error) {
    process.stderr.write("Bootstrap refused: "+error.message+"\\n");
    process.exitCode=1;
  }
}
