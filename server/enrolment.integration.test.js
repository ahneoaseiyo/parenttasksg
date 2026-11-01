import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp,AUTH_TOKENS } from "./index.js";

test("admin-only enrolment, verified linking, revocation and audit",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"enrolment-api-"));
  const app=createApp({enableDemoAuth:true,taskDbPath:join(dir,"db.sqlite")});
  const server=await new Promise(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
  const url="http://127.0.0.1:"+server.address().port;
  async function call(token,method,path,body) {
    const response=await fetch(url+path,{method,headers:{authorization:"Bearer "+token,
      ...(body?{"content-type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:response.status===204?null:await response.json()};
  }
  try {
    const admin=AUTH_TOKENS.adminCentreA,parent=AUTH_TOKENS.parentMeiLingCentreA;
    assert.equal((await call(parent,"GET","/api/enrolments")).status,403);
    assert.equal((await call(parent,"POST","/api/enrolments/children",{name:"Test"})).status,403);
    const child=await call(admin,"POST","/api/enrolments/children",{name:"New Child"});
    assert.equal(child.status,201);
    const childId=child.data.id;
    assert.equal((await call(admin,"POST","/api/enrolments/links",
      {childId,parentUserId:"parent_mei_ling"})).status,400);
    assert.equal((await call(admin,"POST","/api/enrolments/links",
      {childId,parentUserId:"parent_mei_ling",verificationReference:"enrolment-file-123"})).status,201);
    assert.equal((await call(admin,"POST","/api/enrolments/links",
      {childId,parentUserId:"parent_mei_ling",verificationReference:"enrolment-file-123"})).status,409);
    const request=await call(admin,"POST","/api/consent-requests",
      {title:"Consent",terms:"Participation permitted",expiresAt:new Date(Date.now()+86400000).toISOString(),childIds:[childId]});
    assert.equal(request.status,201);
    assert.equal((await call(admin,"POST","/api/consent-requests/"+request.data.id+"/publish")).status,200);
    assert.equal((await call(parent,"GET","/api/consent-requests")).data.some(r=>r.id===request.data.id),true);
    assert.equal((await call(admin,"DELETE","/api/enrolments/links",
      {childId,parentUserId:"parent_mei_ling"})).status,204);
    assert.equal((await call(parent,"GET","/api/consent-requests")).data.some(r=>r.id===request.data.id),false);
    assert.equal((await call(parent,"POST","/api/consents",
      {childId,consentRequestId:request.data.id,decision:"agree"})).status,403);
    const events=(await call(admin,"GET","/api/audit")).data;
    assert.ok(events.some(e=>e.action==="enrolment.parent_revoked"));
    assert.ok(events.some(e=>e.action==="enrolment.parent_linked"));
  } finally {
    await new Promise(resolve=>server.close(resolve));
    app.locals.closeTaskStore();
    rmSync(dir,{recursive:true,force:true});
  }
});
