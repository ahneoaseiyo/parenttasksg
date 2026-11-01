import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { beginEntraLogin,consumeEntraCallback,pkceChallenge,validateBrowserAuthConfig,exchangeEntraCode } from "./entraBrowserAuth.js";
Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
const tenant="11111111-2222-4333-8444-555555555555";
const config={authority:"https://pilot.ciamlogin.com/"+tenant,clientId:"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  apiScope:"api://pilot/access",redirectUri:"http://localhost:5173/auth/callback"};
function store(){const data=new Map();return {setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)||null,removeItem:k=>data.delete(k)};}
test("PKCE challenge matches SHA-256 reference vector",async()=>{
  assert.equal(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});
test("login binds random state, nonce and challenge; callback is single-use",async()=>{
  const sessionStorage=store();let redirect;
  await beginEntraLogin(config,{sessionStorage,location:{assign:url=>redirect=url}});
  const url=new URL(redirect),state=url.searchParams.get("state");
  assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.ok(url.searchParams.get("nonce"));
  assert.equal(url.searchParams.get("scope"),"openid profile api://pilot/access");
  const result=consumeEntraCallback({search:"?state="+state+"&code=authorization-code",sessionStorage});
  assert.equal(result.code,"authorization-code");
  assert.ok(result.verifier);
  assert.throws(()=>consumeEntraCallback({search:"?state="+state+"&code=again",sessionStorage}),/Missing/);
});
test("callback rejects mismatched state and invalid authorization response",async()=>{
  const sessionStorage=store();
  await beginEntraLogin(config,{sessionStorage,location:{assign(){}}});
  assert.throws(()=>consumeEntraCallback({search:"?state=wrong&code=x",sessionStorage}),/rejected/);
});
test("rejects non-tenant authority and insecure redirect",()=>{
  assert.throws(()=>validateBrowserAuthConfig({...config,authority:"https://login.microsoftonline.com/common"}));
  assert.throws(()=>validateBrowserAuthConfig({...config,redirectUri:"http://evil.example/callback"}));
});
test("token exchange posts PKCE verifier and refuses malformed responses",async()=>{
  const tx={authority:config.authority,clientId:config.clientId,apiScope:config.apiScope,
    redirectUri:config.redirectUri,code:"one-time",verifier:"a".repeat(64)};
  const fetchImpl=async(url,options)=>{
    assert.match(url,/\/token$/);
    assert.equal(new URLSearchParams(options.body).get("code_verifier"),tx.verifier);
    return {ok:true,json:async()=>({access_token:"synthetic",token_type:"Bearer",expires_in:120})};
  };
  const result=await exchangeEntraCode(tx,{fetchImpl});
  assert.equal(result.accessToken,"synthetic");
  await assert.rejects(()=>exchangeEntraCode(tx,{fetchImpl:async()=>({ok:false})}),/failed/);
});

test("configuration fails closed on malformed or attacker-controlled endpoints",()=>{
  for(const changes of [
    {authority:"https://user:password@pilot.ciamlogin.com/"+tenant},
    {authority:"https://pilot.ciamlogin.com:8443/"+tenant},
    {authority:"https://pilot.ciamlogin.com/--------------------0000000000000000"},
    {clientId:"test-client"},
    {apiScope:"openid"},
    {apiScope:"api://pilot/access offline_access"},
    {redirectUri:"https://app.example/callback?next=https://evil.example"},
    {redirectUri:"https://user@app.example/callback"},
    {redirectUri:"not a URL"}
  ]) assert.throws(()=>validateBrowserAuthConfig({...config,...changes}));
});
test("code exchange refuses unvalidated endpoints before making network calls",async()=>{
  let calls=0;
  await assert.rejects(()=>exchangeEntraCode({...config,authority:"https://evil.example",code:"code",verifier:"a".repeat(64)},
    {fetchImpl:async()=>{calls++;throw new Error("should not fetch");}}),/Invalid/);
  assert.equal(calls,0);
});
