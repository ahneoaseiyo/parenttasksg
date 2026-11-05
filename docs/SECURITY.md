# Security baseline (draft)

Status: prototype only; not approved for live parent or child information.

## Known issues from source inspection
- CORS currently accepts all origins.
- Data is stored in process memory and disappears on restart.
- Task/message/consent payloads are insufficiently validated.
- AI extraction is heuristic/simulated.
- Singpass-style button is visual only.
- Vite development server listens on all interfaces by default.
- Dependency versions are specified as latest in package.json.

## Current prototype controls
- Synthetic bearer-token authentication is required for `/api/*` endpoints.
- Role authorization is enforced for tasks, messages, consents, audit and settings endpoints.
- Parent users are scoped to their own resources; cross-user access is denied.
- Requests across centres are denied by centre-scoped authorization checks.

## Immediate rules
- Use synthetic data exclusively.
- Do not expose API or dev server to the public Internet.
- Before a parent pilot, replace synthetic tokens with real authN/authZ, add validated input schemas, durable storage, retention/deletion, and full threat-model security tests.
- Scan git history and dependency tree before any public deployment.

## Message to Task (browser-only prototype)
- Pasted messages are held only in React state, are never persisted, and are cleared on save; the app makes no network requests and logs nothing (enforced by `assistant.static.test.js`).
- Only confirmed tasks (plus an optional short source excerpt) are written to `localStorage` under `message-task.v1`. Stored data is unencrypted and is re-validated on every load because it can be edited by anyone with access to the browser.
- All message-derived text is untrusted: it is rendered only as React text, extractor output is validated by `normalizeExtraction()`, and copied Markdown is escaped.
- No API keys, no AI provider, no inbox access, and no authentication changes. A future AI extractor must run behind an authenticated backend after a privacy review.
- See `docs/message-to-task.md` for known limitations.
