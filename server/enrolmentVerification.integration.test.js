import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./index.js";

test("non-demo parent-child linking fails closed until trusted verification succeeds",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"enrolment-verify-"));
  let approved=false,shouldThrow=false;
  const app=createApp({
    enableDemoAuth:false,taskDbPath:join(dir,"db.sqlite"),
    verifyAccessToken:async token=>token==="admin"?{userId:"admin-1",role:"admin",centreId:"centre_a"}:null,
    verifyEnrolment:async input=>{
      assert.equal(input.centreId,"centre_a");
      if(shouldThrow)throw Error("school unavailable");
      return approved;
    }
  });
  const server=await new Promise(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
  const base="http://127.0.0.1:"+server.address().port;
  async function post(path,body) {
    const response=await fetch(base+path,{method:"POST",headers:{authorization:"Bearer admin",
      "content-type":"application/json"},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  }
  try {
    const identity=await post("/api/identities",{issuer:"https://id.example",subject:"subject",
      userId:"parent-1",role:"parent"});
    assert.equal(identity.status,201);
    const child=await post("/api/enrolments/children",{name:"Synthetic Child"});
    assert.equal(child.status,201);
    const payload={childId:child.body.id,parentUserId:"parent-1",verificationReference:"arbitrary-reference"};
    assert.equal((await post("/api/enrolments/links",payload)).status,403);
    shouldThrow=true;
    assert.equal((await post("/api/enrolments/links",payload)).status,503);
    shouldThrow=false;approved=true;
    assert.equal((await post("/api/enrolments/links",payload)).status,201);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    app.locals.closeTaskStore();
    rmSync(dir,{recursive:true,force:true});
  }
});
