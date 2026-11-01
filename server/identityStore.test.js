import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTaskStore } from "./taskStore.js";
import { openIdentityStore } from "./identityStore.js";

test("identity mappings persist, are issuer-scoped and can be revoked",()=>{
  const dir=mkdtempSync(join(tmpdir(),"identity-registry-"));
  const file=join(dir,"test.sqlite");
  const audit={id:"audit-1",centreId:"centre_a",time:new Date().toISOString(),actorId:"admin_siti",actorRole:"admin"};
  const task=openTaskStore(file,[]);
  let store;
  try {
    store=openIdentityStore(file);
    store.provision({issuer:"https://idp.example",subject:"sub-1",userId:"parent-1",centreId:"centre_a",role:"parent"},audit);
    assert.deepEqual(store.resolve("https://idp.example","sub-1"),{userId:"parent-1",centreId:"centre_a",role:"parent"});
    assert.equal(store.resolve("https://other.example","sub-1"),null);
    assert.equal(store.isActiveParent("centre_b","parent-1"),false);
    assert.equal(store.isActiveParent("centre_a","parent-1"),true);
    assert.throws(()=>store.provision({issuer:"https://idp.example",subject:"sub-1",userId:"parent-2",centreId:"centre_a",role:"parent"},{...audit,id:"audit-2"}));
    store.close();
    store=openIdentityStore(file);
    assert.equal(store.isActiveParent("centre_a","parent-1"),true);
    assert.equal(store.deactivate("centre_a","parent-1",{...audit,id:"audit-3"}),true);
    assert.equal(store.resolve("https://idp.example","sub-1"),null);
    assert.equal(store.isActiveParent("centre_a","parent-1"),false);
  } finally {store?.close();task.close();rmSync(dir,{recursive:true,force:true});}
});
