import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync,sign } from "node:crypto";
import { createOidcVerifier } from "./oidcAuth.js";
import { createApp } from "./index.js";

test("OIDC verifier validates signature, audience, expiry and server-owned roles",async()=>{
  const {publicKey,privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
  const jwk=publicKey.export({format:"jwk"});
  const verifier=createOidcVerifier({
    issuer:"https://id.example.test",audience:"parenttask-api",
    jwksUrl:"https://id.example.test/keys",
    identities:[{sub:"external-1",userId:"parent_1",role:"parent",centreId:"centre_a"}],
    fetchKeys:async()=>({ok:true,json:async()=>({keys:[{...jwk,kid:"key1",alg:"RS256"}]})})
  });
  function token(changes={}) {
    const header=Buffer.from(JSON.stringify({alg:"RS256",kid:"key1",typ:"JWT"})).toString("base64url");
    const payload=Buffer.from(JSON.stringify({iss:"https://id.example.test",
      aud:"parenttask-api",sub:"external-1",role:"admin",
      iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,
      ...changes})).toString("base64url");
    const data=header+"."+payload;
    return data+"."+sign("RSA-SHA256",Buffer.from(data),privateKey).toString("base64url");
  }
  assert.deepEqual(await verifier(token()),{userId:"parent_1",role:"parent",centreId:"centre_a"});
  await assert.rejects(verifier(token({aud:"other"})));
  await assert.rejects(verifier(token({exp:1})));
  await assert.rejects(verifier(token({sub:"unknown"})));
  await assert.rejects(verifier(token().slice(0,-3)+"aaa"));
  const app=createApp({enableDemoAuth:false,verifyAccessToken:verifier});
  const server=await new Promise(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
  try {
    const base="http://127.0.0.1:"+server.address().port;
    const response=await fetch(base+"/api/tasks",{headers:{authorization:"Bearer "+token()}});
    assert.equal(response.status,200);
    const denied=await fetch(base+"/api/enrolments",{headers:{authorization:"Bearer "+token()}});
    assert.equal(denied.status,403);
  } finally {await new Promise(resolve=>server.close(resolve));app.locals.closeTaskStore();}
});

test("OIDC checks live identity registry on every token verification",async()=>{
  const {publicKey,privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
  const jwk=publicKey.export({format:"jwk"});
  let active=true;
  const verifier=createOidcVerifier({
    issuer:"https://identity.example",audience:"parenttask-api",
    jwksUrl:"https://identity.example/jwks",
    identities:[{sub:"person",userId:"untrusted",role:"admin",centreId:"wrong"}],
    resolveIdentity:(issuer,subject)=>active && issuer==="https://identity.example" && subject==="person"
      ? {userId:"real-parent",role:"parent",centreId:"centre_a"} : null,
    fetchKeys:async()=>({ok:true,json:async()=>({keys:[{...jwk,kid:"kid",alg:"RS256"}]})})
  });
  const header=Buffer.from(JSON.stringify({alg:"RS256",kid:"kid"})).toString("base64url");
  const claims=Buffer.from(JSON.stringify({iss:"https://identity.example",aud:"parenttask-api",
    sub:"person",role:"admin",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600})).toString("base64url");
  const data=header+"."+claims;
  const token=data+"."+sign("RSA-SHA256",Buffer.from(data),privateKey).toString("base64url");
  assert.deepEqual(await verifier(token),{userId:"real-parent",role:"parent",centreId:"centre_a"});
  active=false;
  await assert.rejects(verifier(token),/Identity not provisioned/);
});
