// Entra External ID uses the same API-side JWT verifier as other trusted OIDC issuers.
// Only tenant-specific ciamlogin.com endpoints are accepted; never use /common or /organizations.
export function validateEntraExternalIdConfiguration({issuer,audience,jwksUrl}) {
  for (const [name,value] of Object.entries({issuer,audience,jwksUrl})) {
    if (typeof value!=="string" || !value.trim()) throw new Error(name+" is required");
  }
  let issuerUrl,jwks;
  try { issuerUrl=new URL(issuer); jwks=new URL(jwksUrl); }
  catch { throw new Error("Invalid Entra endpoint URL"); }
  if (issuerUrl.protocol!=="https:" || jwks.protocol!=="https:" ||
      issuerUrl.username || issuerUrl.password || jwks.username || jwks.password ||
      issuerUrl.search || issuerUrl.hash || jwks.search || jwks.hash)
    throw new Error("Entra endpoints must be HTTPS without credentials or query strings");
  const tenantHost=/^[a-z0-9-]+\.ciamlogin\.com$/i;
  if (!tenantHost.test(issuerUrl.hostname) || issuerUrl.hostname!==jwks.hostname)
    throw new Error("Entra endpoints must use the same tenant-specific ciamlogin.com host");
  if (!/^\/[0-9a-f-]{36}\/v2\.0\/?$/i.test(issuerUrl.pathname))
    throw new Error("Expected a tenant-specific Entra v2 issuer");
  if (!/^\/[0-9a-f-]{36}\/discovery\/v2\.0\/keys$/i.test(jwks.pathname))
    throw new Error("Expected tenant-specific Entra signing keys endpoint");
  const issuerTenant=issuerUrl.pathname.split("/")[1];
  const jwksTenant=jwks.pathname.split("/")[1];
  if (issuerTenant.toLowerCase()!==jwksTenant.toLowerCase())
    throw new Error("Entra issuer and JWKS tenant mismatch");
  if (audience==="common" || audience==="organizations")
    throw new Error("A dedicated API audience is required");
  return {issuer,audience,jwksUrl};
}
