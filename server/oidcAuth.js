import { createPublicKey, verify } from "node:crypto";

function decode(value) {
  return JSON.parse(Buffer.from(value,"base64url").toString("utf8"));
}

// External OIDC provider must issue RS256 access tokens for this API audience.
// Identity-to-role mapping is server-controlled; token claims cannot assign roles.
export function createOidcVerifier({issuer,audience,jwksUrl,identities=[],resolveIdentity,fetchKeys=fetch,refreshCooldownMs=30000}) {
  if(!issuer || !audience || !jwksUrl || !Array.isArray(identities) ||
    (resolveIdentity !== undefined && typeof resolveIdentity !== 'function') ||
    !jwksUrl.startsWith("https://")) throw new Error("OIDC configuration incomplete");
  const principals=new Map();
  for(const identity of identities) {
    if(!identity.sub || !identity.userId || !identity.centreId ||
      !["parent","teacher","admin"].includes(identity.role) ||
      principals.has(identity.sub)) throw new Error("Invalid OIDC identity mapping");
    principals.set(identity.sub,{userId:identity.userId,centreId:identity.centreId,role:identity.role});
  }
  // Deduplicate concurrent JWKS requests and rate-limit unknown-kid refresh attempts.
  let keys=null,loadedAt=0,lastAttemptAt=0,inflight=null;
  async function fetchJwks() {
    const response=await fetchKeys(jwksUrl,{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error("OIDC key retrieval failed");
    const payload=await response.json();
    if(!Array.isArray(payload.keys))throw new Error("Invalid JWKS");
    keys=payload.keys;loadedAt=Date.now();return keys;
  }
  async function loadKeys(force=false) {
    const now=Date.now();
    if(!force && keys && now-loadedAt<300000)return keys;
    if(inflight)return inflight;
    if(keys && now-lastAttemptAt<refreshCooldownMs)return keys;
    if(!keys && lastAttemptAt && now-lastAttemptAt<refreshCooldownMs)throw new Error("OIDC key retrieval throttled");
    lastAttemptAt=now;
    inflight=fetchJwks().finally(()=>{inflight=null;});
    return inflight;
  }
  return async function verifyToken(token) {
    if(typeof token!=="string" || token.length>8192)throw new Error("Invalid access token");
    const parts=token.split(".");
    if(parts.length!==3)throw new Error("Invalid access token");
    const header=decode(parts[0]),claims=decode(parts[1]);
    if(header.alg!=="RS256" || typeof header.kid!=="string" || !header.kid ||
      header.typ && !["JWT","at+jwt"].includes(header.typ))throw new Error("Unsupported token");
    const now=Math.floor(Date.now()/1000);
    if(claims.iss!==issuer || !(claims.aud===audience ||
      Array.isArray(claims.aud)&&claims.aud.includes(audience)) ||
      typeof claims.exp!=="number" || claims.exp<=now ||
      typeof claims.iat!=="number" || claims.iat>now+60 ||
      claims.nbf!==undefined && (typeof claims.nbf!=="number" || claims.nbf>now+60) ||
      typeof claims.sub!=="string")throw new Error("Invalid token claims");
    let key=(await loadKeys()).find(k=>k.kid===header.kid && k.kty==="RSA" &&
      (!k.use || k.use==="sig") && (!k.alg || k.alg==="RS256"));
    if(!key)key=(await loadKeys(true)).find(k=>k.kid===header.kid && k.kty==="RSA" &&
      (!k.use || k.use==="sig") && (!k.alg || k.alg==="RS256"));
    if(!key || !verify("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),
      createPublicKey({key,format:"jwk"}),Buffer.from(parts[2],"base64url")))
      throw new Error("Invalid token signature");
    const principal=resolveIdentity ? await resolveIdentity(issuer,claims.sub) : principals.get(claims.sub);
    if(!principal)throw new Error("Identity not provisioned");
    return principal;
  };
}
