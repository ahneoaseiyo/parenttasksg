# ParentTask SG

ParentTask SG is a Singapore-focused preschool communication prototype that helps parents, teachers, and centre admins manage school tasks in one place.

The app turns school notices into parent action items, consent forms, payment reminders, caregiver handoffs, and teacher-parent message threads. It is designed around local preschool workflows, multilingual households, and centre-level auditability.

## Project Status

This is a working MVP/demo prototype, not a production-ready government system yet.

Current readiness:

- Demo / pitch prototype: high
- Pilot MVP foundation: medium
- Production / government-ready: still requires real authentication, database, deployment, security review, and legal/PDPA review

## Key Features

- Parent task dashboard
- Auto task extraction from school notices
- Consent form signing flow
- Caregiver sharing controls
- Teacher broadcast mode
- Teacher-parent messaging mode
- Centre admin console
- Audit and compliance surfaces
- Government buyer brief
- Singpass-style visual login button for demo purposes
- Lightweight Express API prototype

## Tech Stack

- React
- Vite
- Framer Motion
- Express
- Node.js

## Run Locally

Install dependencies:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

Start the backend API in another terminal:

```bash
npm run api
```

Open the app:

```text
http://127.0.0.1:5173
```

API health check:

```text
http://127.0.0.1:8787/health
```

## Network Demo

The Vite dev server is configured to listen on `0.0.0.0`, so another device on the same network can open the app using your computer's local IP address.

Example:

```text
http://YOUR_LOCAL_IP:5173
```

## Useful Commands

```bash
npm run dev
npm run api
npm run build
npm run preview
```

## Demo Flows

From the login screen:

- Parent login: view parent checklist, consent forms, caregiver sharing, and task extraction
- Teacher login: send broadcasts and reply to parent messages
- Centre admin console: view pilot KPIs, audit log, data retention, and notification settings
- Government brief: see the public-sector positioning and pilot proposal framing

## API Prototype

The lightweight API is in `server/index.js`.

Available prototype endpoints:

- `GET /health`
- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/broadcasts`
- `POST /api/broadcasts`
- `GET /api/messages/threads`
- `POST /api/messages/threads/:id/messages`
- `POST /api/consents`
- `POST /api/ai/extract`
- `GET /api/audit`
- `GET /api/settings`
- `PATCH /api/settings`

## Important Notes

- The Singpass button is visual only. It is not a real Singpass integration.
- AI extraction is simulated for the demo.
- The API uses in-memory data, so data resets when the server restarts.
- Do not use this with real child, parent, medical, or payment data yet.
- Production use would require proper authentication, authorization, database storage, encryption, audit retention, deployment controls, and PDPA/legal review.

## Roadmap

- Real database, likely Postgres
- Role-based authentication for parent, teacher, centre admin, and caregiver
- Real notification channels
- File upload for forms and evidence photos
- Payment workflow integration
- Teacher approval queue for AI-generated tasks
- Exportable audit logs
- Accessibility review
- Cloud deployment in a Singapore region
- Pilot with selected preschool centres

## Related Docs

- `PRODUCTION_READINESS.md`
- `OUTREACH_PACK.md`
