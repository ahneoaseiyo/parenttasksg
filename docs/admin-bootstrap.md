# Offline first-administrator bootstrap (development/pilot only)

The first centre administrator cannot self-register via HTTP. An authorized operator must verify the centre and the administrator independently, obtain the **exact** OIDC issuer and subject from the selected provider, and use the offline command on the server hosting the SQLite database.

Initialize the database using the existing app migrations first. With the API stopped and a backup taken:

```sh
ALLOW_LOCAL_ADMIN_BOOTSTRAP=yes node server/bootstrapAdmin.js /absolute/path/app.sqlite https://issuer.example subject-from-provider admin-user-id centre-id
```

This operation is atomic, records `identity.bootstrap_admin` in the audit trail, and refuses any second bootstrap for a centre that already has an identity principal. It does not create login credentials or bypass token signature verification. Keep server and database access restricted. Never put real parent or child information in development databases.

**Limitations:** This is an operator-only pilot bootstrap, not a verified onboarding workflow. The CLI does not independently verify school authority or administrator identity. It assumes a correctly selected trusted OIDC provider and an authenticated operator. Recovery, secure operator identity verification, hosted DB deployment, and a formal school approval process remain future work.
