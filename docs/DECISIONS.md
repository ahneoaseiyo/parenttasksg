# Decision log

## 2026-11-01 — Initial governance
- GitHub is the source of truth for development.
- Use existing Copilot/Gemini/ChatGPT entitlements before purchasing extra AI services.
- Keep human approval for merges, deployments, spending, and external communication.
- Begin with synthetic data; no real family or child records.
- Do not claim any government partnership or official identity integration.

## 2026-11-05 — Pivot to a universal Message to Task assistant (frontend prototype)
- The default screen is a browser-only paste → extract → review → save → copy workflow for any kind of message; the preschool demo is kept at `#/school-demo`.
- Extraction is a replaceable service with a deterministic, clearly labelled demo implementation. No real AI provider, keys or inbox access in this change.
- Tasks are stored only in the user's browser; the original message is never stored. No account, no sync.
- Ambiguous deadlines are flagged and left empty rather than guessed; the extractor never assigns a task to the user.
- Backend and authentication modules are untouched.
