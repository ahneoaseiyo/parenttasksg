import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, AUTH_TOKENS } from "./index.js";
import { openTaskStore } from "./taskStore.js";

async function start(path) {
  const app = createApp({ enableDemoAuth:true, taskDbPath:path });
  const server = await new Promise(resolve => {
    const instance = app.listen(0,"127.0.0.1",()=>resolve(instance));
  });
  return {
    url:"http://127.0.0.1:"+server.address().port,
    async close() {
      await new Promise(resolve=>server.close(resolve));
      app.locals.closeTaskStore();
    },
  };
}
async function request(instance, token, route, method="GET", payload) {
  const response = await fetch(instance.url+route,{
    method,
    headers:{authorization:"Bearer "+token,...(payload ? {"content-type":"application/json"}:{})},
    ...(payload ? {body:JSON.stringify(payload)}:{}),
  });
  return {status:response.status,body:await response.json()};
}

test("task audit is attributable, centre-isolated, admin-only and survives restart", async () => {
  const dir=mkdtempSync(join(tmpdir(),"parenttask-audit-"));
  const path=join(dir,"tasks.sqlite");
  let server;
  try {
    server=await start(path);
    const changed=await request(server,AUTH_TOKENS.parentMeiLingCentreA,"/api/tasks/task_1","PATCH",{status:"Done"});
    assert.equal(changed.status,200);
    assert.equal((await request(server,AUTH_TOKENS.parentMeiLingCentreA,"/api/audit")).status,403);
    assert.equal((await request(server,AUTH_TOKENS.teacherCentreA,"/api/audit")).status,403);
    const events=await request(server,AUTH_TOKENS.adminCentreA,"/api/audit");
    assert.equal(events.status,200);
    const event=events.body.find(e=>e.action==="task.updated"&&e.resourceId==="task_1");
    assert.ok(event);
    assert.equal(event.actorId,"parent_mei_ling");
    assert.equal(event.actorRole,"parent");
    assert.equal(event.centreId,"centre_a");
    assert.ok(!Number.isNaN(Date.parse(event.time)));
    await server.close();
    server=null;
    server=await start(path);
    const persisted=await request(server,AUTH_TOKENS.adminCentreA,"/api/audit");
    assert.ok(persisted.body.some(e=>e.id===event.id));
    const forbidden=await request(server,AUTH_TOKENS.teacherCentreB,"/api/tasks/task_1","PATCH",{status:"Not done"});
    assert.equal(forbidden.status,403);
  } finally {
    if(server) await server.close();
    rmSync(dir,{recursive:true,force:true});
  }
});

test("task write rolls back if audit insert fails", () => {
  const dir=mkdtempSync(join(tmpdir(),"parenttask-audit-"));
  const path=join(dir,"tasks.sqlite");
  const seed={id:"task_test",centreId:"centre_a",parentUserId:"parent_mei_ling",child:"Arielle",level:"K1",title:"Bring book",category:"Things to bring",status:"Not done",priority:"High",dueLabel:"Tomorrow"};
  try {
    const store=openTaskStore(path,[seed]);
    const event={id:"same_id",centreId:"centre_a",time:new Date().toISOString(),actorId:"parent_mei_ling",actorRole:"parent",action:"task.updated",resourceType:"Task",resourceId:seed.id};
    store.update(seed.id,{status:"Done"},event);
    assert.throws(()=>store.update(seed.id,{status:"Not done"},event));
    assert.equal(store.get(seed.id).status,"Done");
    assert.equal(store.listAudit("centre_a").length,1);
    store.close();
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test("broadcast, message, settings and AI events reach the durable admin audit log",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"parenttask-audit-all-"));
  const path=join(dir,"tasks.sqlite");
  let server;
  try {
    server=await start(path);
    const secret="private-message-body-do-not-log";
    assert.equal((await request(server,AUTH_TOKENS.teacherCentreA,"/api/broadcasts","POST",
      {title:"Trip reminder",category:"Reminder",dueLabel:"Friday"})).status,201);
    assert.equal((await request(server,AUTH_TOKENS.parentMeiLingCentreA,"/api/messages/threads/thread_1/messages","POST",
      {text:secret})).status,201);
    assert.equal((await request(server,AUTH_TOKENS.adminCentreA,"/api/settings","PATCH",{retentionMonths:12})).status,200);
    assert.equal((await request(server,AUTH_TOKENS.teacherCentreA,"/api/ai/extract","POST",
      {message:"Please bring a water bottle"})).status,200);
    const events=(await request(server,AUTH_TOKENS.adminCentreA,"/api/audit")).body;
    const actions=new Map(events.map(e=>[e.action,e]));
    for(const action of ["broadcast.created","message.created","settings.updated","ai.extraction_drafted"])
      assert.ok(actions.has(action),"missing audit action "+action);
    assert.equal(actions.get("message.created").actorId,"parent_mei_ling");
    assert.equal(actions.get("message.created").resourceId,"thread_1");
    assert.equal(actions.get("settings.updated").resourceId,"centre_a");
    assert.ok(!JSON.stringify(events).includes(secret),"message content must not be written to audit");
    const otherCentre=(await request(server,AUTH_TOKENS.teacherCentreB,"/api/broadcasts")).body;
    assert.deepEqual(otherCentre,[]);
    await server.close();
    server=await start(path);
    const persisted=(await request(server,AUTH_TOKENS.adminCentreA,"/api/audit")).body;
    assert.ok(persisted.some(e=>e.action==="settings.updated"));
    assert.ok(persisted.some(e=>e.action==="message.created"));
  } finally {
    if(server) await server.close();
    rmSync(dir,{recursive:true,force:true});
  }
});
