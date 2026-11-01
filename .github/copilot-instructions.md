# ParentTask SG engineering instructions

This repository is an early-stage Singapore family/school task management prototype, NOT a production government service.

## Rules
- Work from GitHub Issues with explicit acceptance criteria. Use feature branches and pull requests; never merge or deploy without founder approval.
- Only implement issues that are explicitly founder-approved in the issue body (or with an equivalent approved label/state). If approval is missing, stop and request approval first.
- Never introduce real child/parent data, credentials, or school messages into demos or third-party AI tools.
- Do not imply real Singpass, MOE, GovTech, or ECDA integration.
- Distinguish simulated UI and in-memory endpoints from production features.
- Prioritize secure server-side authorization, input validation, minimal data collection, and reliable automated tests.
- Do not automatically send external messages, incur paid usage, or publish releases.
- Keep changes small; explain testing, risks, and rollback in every PR.
- Never store API keys in frontend code or committed files.
