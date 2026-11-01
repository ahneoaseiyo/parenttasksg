import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp,AUTH_TOKENS } from "./index.js";

async function start(path) {
  const app=createApp({enableDemoAuth:true,taskDbPath:path});
  const server=await new Promise(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
  return {url:"http://127.0.0.1:"+server.address().port,async close(){
    await new Promise(resolve=>server.close(resolve));
    app.locals.closeTaskStore();
  }};
}
async function call(instance,token,method,path,body) {
  const res=await fetch(instance.url+path,{method,headers:{
    authorization:"Bearer "+token,...(body?{"content-type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:res.status,data:await res.json()};
}
test("consent is persistent, unique, parent-owned, centre-scoped and audited",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"consent-test-"));
  let app;
  try {
    const path=join(dir,"data.sqlite");
    app=await start(path);
    const created=await call(app,AUTH_TOKENS.teacherCentreA,"POST","/api/consent-requests",{
      title:"School trip",terms:"I authorize participation in the school trip.",
      expiresAt:new Date(Date.now()+86400000).toISOString(),childIds:["child_arielle_a"]});
    assert.equal(created.status,201);
    const requestId=created.data.id;
    assert.equal((await call(app,AUTH_TOKENS.parentMeiLingCentreA,"POST","/api/consents",
      {childId:"child_arielle_a",consentRequestId:requestId,decision:"agree"})).status,409);
    assert.equal((await call(app,AUTH_TOKENS.teacherCentreA,"POST",
      "/api/consent-requests/"+requestId+"/publish")).status,200);
    const payload={childId:"child_arielle_a",consentRequestId:requestId,decision:"agree"};
    const submit=await call(app,AUTH_TOKENS.parentMeiLingCentreA,"POST","/api/consents",payload);
    assert.equal(submit.status,201);
    assert.equal(submit.data.parentUserId,"parent_mei_ling");
    assert.equal(submit.data.termsSnapshot,"I authorize participation in the school trip.");
    assert.equal((await call(app,AUTH_TOKENS.parentMeiLingCentreA,"POST","/api/consents",payload)).status,409);
    assert.equal((await call(app,AUTH_TOKENS.parentHafizCentreA,"POST","/api/consents",payload)).status,403);
    assert.deepEqual((await call(app,AUTH_TOKENS.teacherCentreB,"GET","/api/consents")).data,[]);
    assert.deepEqual((await call(app,AUTH_TOKENS.parentHafizCentreA,"GET","/api/consents")).data,[]);
    const audit=(await call(app,AUTH_TOKENS.adminCentreA,"GET","/api/audit")).data;
    assert.ok(audit.some(e=>e.action==="consent.submitted"&&e.resourceId===submit.data.id&&e.actorId==="parent_mei_ling"));
    assert.equal((await call(app,AUTH_TOKENS.teacherCentreA,"POST",
      "/api/consent-requests/"+requestId+"/withdraw")).status,200);
    await app.close();app=null;
    app=await start(path);
    const saved=await call(app,AUTH_TOKENS.parentMeiLingCentreA,"GET","/api/consents");
    assert.equal(saved.data.length,1);
    assert.equal(saved.data[0].id,submit.data.id);
    assert.equal((await call(app,AUTH_TOKENS.parentMeiLingCentreA,"POST","/api/consents",payload)).status,409);
  } finally {if(app)await app.close();rmSync(dir,{recursive:true,force:true});}
});
