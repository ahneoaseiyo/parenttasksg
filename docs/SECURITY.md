# Security baseline (draft)

Status: prototype only; not approved for live parent or child information.

## Known issues from source inspection
- Express API has no authentication or authorization for tasks, messages, consents, settings or audit endpoints.
- CORS currently accepts all origins.
- Data is stored in process memory and disappears on restart.
- Task/message/consent payloads are insufficiently validated.
- AI extraction is heuristic/simulated.
- Singpass-style button is visual only.
- Vite development server listens on all interfaces by default.
- Dependency versions are specified as latest in package.json.

## Immediate rules
- Use synthetic data exclusively.
- Do not expose API or dev server to the public Internet.
- Before a parent pilot, implement real authN/authZ, validated input schemas, durable storage, retention/deletion, audit access controls, secrets management, and threat-model-based security tests.
- Scan git history and dependency tree before any public deployment.
