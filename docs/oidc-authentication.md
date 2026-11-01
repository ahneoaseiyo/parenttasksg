# OIDC authentication foundation (not production deployment approval)

The API can verify externally issued **RS256 JWT access tokens** when demo authentication is disabled. It does not implement login, account provisioning, or a browser authorization-code/PKCE flow.

Required environment variables:
- `OIDC_ISSUER`: exact issuer in access-token `iss`
- `OIDC_AUDIENCE`: dedicated API audience in `aud`
- `OIDC_JWKS_URL`: HTTPS JWKS endpoint from the trusted issuer
- `TASK_DB_PATH`: writable SQLite database path; required for OIDC identity lookup. Provision issuer/subject mappings using the authenticated centre administrator's `POST /api/identities` endpoint after independent identity verification.

Do **not** put user-supplied roles or centre IDs into the mapping. Provision them only after independent enrolment and staff verification. The app fails closed when OIDC is not configured and demo auth is disabled.

Important deployment gaps: provider choice and discovery, browser login with Authorization Code + PKCE, session lifecycle and logout, JWKS rotation operational checks, token revocation strategy, secure initial administrator bootstrap and recovery, roster validation against authoritative school records, HTTPS reverse proxy, secret management, security review and PDPA assessment. Never use real student data in this prototype.

JWTs are accepted only when signed with RS256, issued by the configured issuer, intended for the configured audience, unexpired, and mapped to a provisioned principal. The API deliberately ignores any role or centre claims supplied by the token.

With a configured OIDC provider, the API resolves the signed token's issuer and subject against the active SQLite identity registry **on every request**. Deactivated users are denied even if their JWT has not expired. The legacy `OIDC_IDENTITY_MAP_JSON` variable is no longer used by the automatic API verifier. A separately injected `verifyAccessToken` function is a test/integration escape hatch and must enforce equivalent checks. Administrator bootstrap is not yet implemented; do not deploy this as a live authentication system.
