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

## 2026-11-05 — UI refinement of Message to Task
- Layout only: four sections (Extract & Review, My Tasks, Local History, Settings), a 240px desktop sidebar, a 45% / 55% input and review split, and a plain disclosure menu on mobile. Extraction, reducer, date handling, storage and copy logic are unchanged.
- The visual system lives in one block of CSS variables. The Gemini specification was not supplied, so the values are interim choices to be replaced, not a copy of it.
- Privacy wording on screen is: "Tasks are saved on this device. Avoid pasting confidential or sensitive information into this prototype." No zero-retention claim is made anywhere (a test enforces this).
- Only three on/off preferences are persisted (separate key from tasks). No BYOK or API keys, no real AI, no `.ics` or calendar APIs, no accounts, analytics, collaboration or subscriptions, and no Tailwind.
