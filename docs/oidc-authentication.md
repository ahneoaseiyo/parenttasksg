# OIDC authentication foundation (not production deployment approval)

The API can verify externally issued **RS256 JWT access tokens** when demo authentication is disabled. It does not implement login, account provisioning, or a browser authorization-code/PKCE flow.

Required environment variables:
- `OIDC_ISSUER`: exact issuer in access-token `iss`
- `OIDC_AUDIENCE`: dedicated API audience in `aud`
- `OIDC_JWKS_URL`: HTTPS JWKS endpoint from the trusted issuer
- `OIDC_IDENTITY_MAP_JSON`: JSON array of server-provisioned mappings, e.g. `[{"sub":"provider-subject","userId":"parent_mei_ling","role":"parent","centreId":"centre_a"}]`

Do **not** put user-supplied roles or centre IDs into the mapping. Provision them only after independent enrolment and staff verification. The app fails closed when OIDC is not configured and demo auth is disabled.

Important deployment gaps: provider choice and discovery, browser login with Authorization Code + PKCE, session lifecycle and logout, JWKS rotation operational checks, token revocation strategy, persistent identity provisioning (currently environment JSON), roster validation against authoritative school records, HTTPS reverse proxy, secret management, security review and PDPA assessment. Never use real student data in this prototype.

JWTs are accepted only when signed with RS256, issued by the configured issuer, intended for the configured audience, unexpired, and mapped to a provisioned principal. The API deliberately ignores any role or centre claims supplied by the token.
