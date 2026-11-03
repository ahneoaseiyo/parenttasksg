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


function jwksFixture(fetchKeys,extra={}) {
  const {publicKey,privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
  const jwk=publicKey.export({format:"jwk"});
  const make=(kid,signingKey=privateKey)=>{
    const header=Buffer.from(JSON.stringify({alg:"RS256",kid})).toString("base64url");
    const claims=Buffer.from(JSON.stringify({iss:"https://identity.example",aud:"parenttask-api",sub:"person",
      iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600})).toString("base64url");
    const data=header+"."+claims;
    return data+"."+sign("RSA-SHA256",Buffer.from(data),signingKey).toString("base64url");
  };
  const verifier=createOidcVerifier({issuer:"https://identity.example",audience:"parenttask-api",
    jwksUrl:"https://identity.example/jwks",
    resolveIdentity:()=>({userId:"u",role:"parent",centreId:"centre_a"}),fetchKeys,...extra});
  return {jwk,privateKey,make,verifier};
}

test("unknown key IDs cannot trigger a JWKS fetch per request",async()=>{
  let calls=0,jwk;
  const fixture=jwksFixture(async()=>{calls++;return {ok:true,json:async()=>({keys:[{...jwk,kid:"real",alg:"RS256"}]})};});
  jwk=fixture.jwk;
  for(let i=0;i<10;i++)await assert.rejects(fixture.verifier(fixture.make("forged-"+i)));
  assert.equal(calls,1);
  assert.ok(await fixture.verifier(fixture.make("real")));
  assert.equal(calls,1);
});

test("concurrent first requests share one JWKS fetch",async()=>{
  let calls=0,jwk;
  const fixture=jwksFixture(async()=>{calls++;await new Promise(r=>setTimeout(r,20));
    return {ok:true,json:async()=>({keys:[{...jwk,kid:"real",alg:"RS256"}]})};});
  jwk=fixture.jwk;
  const results=await Promise.all(Array.from({length:8},()=>fixture.verifier(fixture.make("real"))));
  assert.equal(results.length,8);
  assert.equal(calls,1);
});

test("key rotation still works once the refresh cooldown has passed",async()=>{
  const first=generateKeyPairSync("rsa",{modulusLength:2048});
  const second=generateKeyPairSync("rsa",{modulusLength:2048});
  let keys=[{...first.publicKey.export({format:"jwk"}),kid:"old",alg:"RS256"}];
  const fixture=jwksFixture(async()=>({ok:true,json:async()=>({keys})}),{refreshCooldownMs:0});
  assert.ok(await fixture.verifier(fixture.make("old",first.privateKey)));
  keys=[...keys,{...second.publicKey.export({format:"jwk"}),kid:"new",alg:"RS256"}];
  assert.ok(await fixture.verifier(fixture.make("new",second.privateKey)));
});

test("a failed initial JWKS fetch is throttled instead of retried per request",async()=>{
  let calls=0;
  const fixture=jwksFixture(async()=>{calls++;return {ok:false};});
  for(let i=0;i<5;i++)await assert.rejects(fixture.verifier(fixture.make("any")));
  assert.equal(calls,1);
});
