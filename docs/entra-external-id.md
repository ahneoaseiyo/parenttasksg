# Microsoft Entra External ID — pilot setup

**Status:** Provider selection and API-side configuration validation only. Browser login, PKCE, logout, and real school onboarding are **not yet implemented**. Do not use real child data.

1. Create a Microsoft Entra **external tenant** for the pilot, with authorized ownership and billing. Confirm current licensing and availability in the Microsoft admin portal.
2. Register a **web or SPA client** for the future login interface and a **separate API application**. Configure an API scope and explicit permission grants. Do not confuse an ID token for the SPA with an access token intended for the API.
3. Configure a sign-up/sign-in user flow. Restrict who may access the pilot. **Self-sign-up never provisions centre roles or parent-child relationships.**
4. Obtain the tenant-specific issuer, JWKS URL, and API audience from the tenant's published OpenID Connect metadata and access-token claims. Do not copy placeholders below into production.
5. Configure the backend, using the **actual** values discovered from the tenant:
   - `OIDC_PROVIDER=entra-external-id`
   - `OIDC_ISSUER=https://<tenant-subdomain>.ciamlogin.com/<tenant-guid>/v2.0`
   - `OIDC_JWKS_URL=https://<tenant-subdomain>.ciamlogin.com/<tenant-guid>/discovery/v2.0/keys`
   - `OIDC_AUDIENCE=<dedicated-api-audience-from-real-access-token>`
   - `TASK_DB_PATH=<existing-sqlite-database-path>`
   - `ENABLE_DEMO_AUTH=false`
6. After independently verifying the school operator, provision the first administrator through the existing **offline bootstrap**. Additional identities must be explicitly provisioned by authorized school administrators.

**Security:** The backend validates access-token signature, issuer, audience and expiry, then checks the active identity registry. Roles and centre IDs come only from the registry. This PR adds tenant endpoint validation when `OIDC_PROVIDER=entra-external-id`; it does not change the general OIDC verifier or create browser sessions.

**Outstanding:** Implement Authorization Code + PKCE with state/nonce and secure token handling, logout, browser error handling, Microsoft app registrations and redirect URI configuration, operational secrets, school identity checks, and formal privacy/security review. Entra External ID is not Singpass.
