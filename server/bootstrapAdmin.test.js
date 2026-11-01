import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTaskStore } from "./taskStore.js";
import { openIdentityStore } from "./identityStore.js";
import { bootstrapAdministrator } from "./bootstrapAdmin.js";

test("offline bootstrap is one-time, issuer-bound and audit-backed",()=>{
  const dir=mkdtempSync(join(tmpdir(),"admin-bootstrap-"));
  const dbPath=join(dir,"db.sqlite");
  try {
    assert.throws(()=>bootstrapAdministrator({dbPath,issuer:"issuer",subject:"sub",userId:"admin",centreId:"a"}),/Existing initialized/);
    const task=openTaskStore(dbPath,[]);task.close();
    const input={dbPath,issuer:"https://id.example",subject:"external-admin",userId:"admin-1",centreId:"centre_a"};
    bootstrapAdministrator(input);
    const identity=openIdentityStore(dbPath);
    try {
      assert.deepEqual(identity.resolve(input.issuer,input.subject),
        {userId:"admin-1",centreId:"centre_a",role:"admin"});
      assert.throws(()=>bootstrapAdministrator({...input,subject:"other"}),/Centre already initialized/);
      assert.equal(identity.resolve(input.issuer,"other"),null);
      const auditStore=openTaskStore(dbPath,[]);
      const events=auditStore.listAudit("centre_a");
      auditStore.close();
      assert.ok(events.some(x=>x.action==="identity.bootstrap_admin"));
    } finally {identity.close();}
  } finally {rmSync(dir,{recursive:true,force:true});}
});
