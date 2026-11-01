// Browser-only Authorization Code + PKCE primitives. Tokens are deliberately memory-only.
// Callers must use a tenant-specific authority and an API scope (not an ID-token-only request).
const encoder=new TextEncoder();
function randomUrlSafe(bytes=32) {
  const values=new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values,b=>b.toString(16).padStart(2,"0")).join("");
}
function base64Url(bytes) {
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export async function pkceChallenge(verifier) {
  if(!/^[a-zA-Z0-9._~-]{43,128}$/.test(verifier))throw new Error("Invalid PKCE verifier");
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(verifier))));
}
export function validateBrowserAuthConfig({authority,clientId,apiScope,redirectUri}) {
  if([authority,clientId,apiScope,redirectUri].some(v=>typeof v!=="string" || !v.trim()))throw new Error("Missing browser OIDC configuration");
  let url,redirect;
  try {url=new URL(authority);redirect=new URL(redirectUri);}
  catch {throw new Error("Invalid browser OIDC URL");}
  if(url.protocol!=="https:" || url.username || url.password || url.port || !/^[a-z0-9-]+\.ciamlogin\.com$/i.test(url.hostname) ||
     !/^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i.test(url.pathname) || url.search || url.hash ||
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId) ||
     !/^[^\\s?#]+\\/[^\\s?#]+$/.test(apiScope) ||
     (redirect.protocol!=="https:" && !(redirect.protocol==="http:" && ["localhost","127.0.0.1"].includes(redirect.hostname))) ||
     redirect.username || redirect.password || redirect.hash || redirect.search ||
     (redirect.protocol==="https:" && !redirect.hostname))
    throw new Error("Invalid browser OIDC configuration");
  return {authority:url.origin+url.pathname.replace(/\/$/,""),clientId,apiScope,redirectUri};
}
export async function beginEntraLogin(config,{sessionStorage,location}) {
  const {authority,clientId,apiScope,redirectUri}=validateBrowserAuthConfig(config);
  const verifier=randomUrlSafe(),state=randomUrlSafe(),nonce=randomUrlSafe();
  const challenge=await pkceChallenge(verifier);
  const transaction={verifier,state,nonce,createdAt:Date.now(),redirectUri,authority,clientId,apiScope};
  sessionStorage.setItem("parenttask.oidc.transaction",JSON.stringify(transaction));
  const url=new URL(authority+"/oauth2/v2.0/authorize");
  url.search=new URLSearchParams({client_id:clientId,response_type:"code",redirect_uri:redirectUri,
    response_mode:"query",scope:"openid profile "+apiScope,code_challenge:challenge,
    code_challenge_method:"S256",state,nonce}).toString();
  location.assign(url.href);
}
export function consumeEntraCallback({search,sessionStorage,now=Date.now()}) {
  const key="parenttask.oidc.transaction";
  const saved=sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  if(!saved)throw new Error("Missing login transaction");
  const tx=JSON.parse(saved),params=new URLSearchParams(search);
  if(!tx.createdAt || now-tx.createdAt>300000 || now<tx.createdAt ||
     params.getAll("state").length!==1 || params.get("state")!==tx.state ||
     params.has("error") || params.getAll("code").length!==1 || !params.get("code") ||
     !/^[a-zA-Z0-9._~-]{43,128}$/.test(tx.verifier) || !tx.authority || !tx.redirectUri)
    throw new Error("Login callback rejected");
  return {code:params.get("code"),verifier:tx.verifier,nonce:tx.nonce,
    redirectUri:tx.redirectUri,authority:tx.authority,clientId:tx.clientId,apiScope:tx.apiScope};
}
export async function exchangeEntraCode(tx,{fetchImpl=fetch}={}) {
  const {authority,clientId,apiScope,redirectUri}=validateBrowserAuthConfig(tx);\n  if(typeof tx.code!=="string" || !tx.code || !/^[a-zA-Z0-9._~-]{43,128}$/.test(tx.verifier))throw new Error("Invalid code exchange transaction");\n  const endpoint=authority+"/oauth2/v2.0/token";
  const response=await fetchImpl(endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"authorization_code",client_id:tx.clientId,
      code:tx.code,redirect_uri:tx.redirectUri,code_verifier:tx.verifier,scope:"openid profile "+tx.apiScope})});
  if(!response.ok)throw new Error("Token exchange failed");
  const data=await response.json();
  if(typeof data.access_token!=="string" || !data.access_token ||
     typeof data.token_type!=="string" || data.token_type.toLowerCase()!=="bearer" ||
     typeof data.expires_in!=="number" || data.expires_in<=0)
    throw new Error("Invalid token response");
  return {accessToken:data.access_token,expiresAt:Date.now()+Math.min(data.expires_in,3600)*1000};
}
