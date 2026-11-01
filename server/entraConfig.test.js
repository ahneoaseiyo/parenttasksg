import test from "node:test";
import assert from "node:assert/strict";
import { validateEntraExternalIdConfiguration } from "./entraConfig.js";
const tenant="11111111-2222-4333-8444-555555555555";
const host="schooltenant.ciamlogin.com";
const valid={issuer:`https://${host}/${tenant}/v2.0`,
  audience:"api://parenttask-pilot",
  jwksUrl:`https://${host}/${tenant}/discovery/v2.0/keys`};
test("accepts matching tenant-specific Entra External ID endpoints",()=>{
  assert.deepEqual(validateEntraExternalIdConfiguration(valid),valid);
});
test("rejects cross-tenant keys, common issuer, insecure endpoints and invalid audience",()=>{
  for(const patch of [
    {jwksUrl:valid.jwksUrl.replace(tenant,"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")},
    {jwksUrl:valid.jwksUrl.replace(host,"attacker.example")},
    {issuer:"https://login.microsoftonline.com/common/v2.0"},
    {issuer:valid.issuer.replace("https:","http:")},
    {audience:""},
    {issuer:valid.issuer+"?redirect=evil"}
  ]) assert.throws(()=>validateEntraExternalIdConfiguration({...valid,...patch}));
});
