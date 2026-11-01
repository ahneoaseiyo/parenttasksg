# ParentTask SG AI Team Operating Model

## Source of truth
GitHub Issues = assigned work; pull requests = code review; docs/DECISIONS.md = accepted decisions. Chat conversations are not authoritative records.

## Roles
- Founder: priorities, funding, external communications, data access, merge and deployment approvals.
- ChatGPT: product requirements, technical and security review, planning.
- GitHub Copilot: implementation and tests on isolated branches.
- Gemini: independent review when manually provided a safe diff or when a verified integration is configured.

These systems do not automatically communicate. No autonomous cross-vendor orchestration is configured yet and no such claim should be made until an integration is implemented and tested.

## Workflow
1. Create issue with scope, acceptance criteria, test requirements and privacy classification.
2. Founder approves issue.
3. Coding agent creates branch and pull request with tests.
4. Independent reviewer checks diff and risks.
5. CI must pass.
6. Founder approves merge and deployment separately.

## Manual Gemini handoff (current state)
1. Human reviewer exports or copies a safe PR diff and minimal context from GitHub.
2. Human reviewer manually submits that material to Gemini for independent review.
3. Findings are copied back into the PR as comments with required follow-up tasks.

## Acceptance example
Issue (founder-approved) → feature branch → pull request → CI pass → founder approval.

## Prohibited without explicit approval
Production data, third-party sharing of personal information, secret access, outbound outreach, financial spending, autonomous merges and deployments.
