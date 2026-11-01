# ParentTask SG Production Readiness Plan

This document turns the current demo into a practical path toward a product that can be piloted with Singapore preschool operators or public-sector stakeholders.

## Current State

The app is a React/Vite prototype with parent checklist, teacher broadcasts, teacher-parent messages, consent form workflow, caregiver sharing, and a government buyer brief.

## Phase 1: Pilot MVP

- Backend API for tasks, broadcasts, messages, consent forms, audit logs, and centre settings
- Role model for parent, teacher, centre admin, and caregiver
- Centre admin view for compliance settings, retention policy, audit log, and pilot metrics
- Simulated notification channels for push, email, SMS, and WhatsApp
- Simulated file evidence for forms and task photos
- AI extraction routed through backend API, with teacher approval before sending

## Phase 2: Secure Beta

- Real database, preferably Postgres
- Auth with school-issued accounts, SSO, or approved identity provider
- Encrypted secrets and environment-based configuration
- Server-side authorization checks for every resource
- Audit log exports for centre admins
- Data retention and deletion job
- Accessibility review against WCAG expectations
- Mobile usability testing with parents and teachers

## Phase 3: Government / Enterprise Readiness

- PDPA review with legal counsel
- Security architecture review and threat model
- Vulnerability scanning and penetration test
- Cloud deployment in an approved Singapore region
- Backup, disaster recovery, and incident response plan
- Procurement materials: pilot outcomes, pricing, SLA, DPA, security pack
- Integration plan for existing centre management systems and approved payment workflows

## Non-Negotiables Before Selling

- No AI or payment API keys in frontend code
- No sensitive child data in browser-only storage for production
- Clear parent consent and data retention policy
- Teacher approval for AI-generated tasks or translations
- Centre-admin visibility into messages, broadcasts, consent submissions, and audit history
- Real pilot metrics from centres, not estimated numbers only
