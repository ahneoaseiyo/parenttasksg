# ParentTask SG

React/Vite prototype. The default screen is now **Message to Task**: paste a message, review the tasks in it, save them in your browser and copy the list. It uses a clearly labelled **demo extractor (fixed rules, not AI)**, needs no account or API key, and sends nothing anywhere. See [docs/message-to-task.md](docs/message-to-task.md). It is a prototype for synthetic messages only, not production software.

The earlier ParentTask SG preschool demo (a Singapore-focused parent task and consent workflow) is still available at `http://127.0.0.1:5173/#/school-demo`.

## Run Locally

```bash
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:5173
```

To run the API prototype in a second terminal:

```bash
npm run api
```

API health check:

```text
http://127.0.0.1:8787/health
```

API endpoints under `/api/*` now require a synthetic bearer token for development-only role simulation:

- `token_parent_mei_ling_centre_a`
- `token_parent_hafiz_centre_a`
- `token_teacher_centre_a`
- `token_admin_centre_a`
- `token_teacher_centre_b`

These static demo tokens are intentionally disabled when `NODE_ENV=production`. This prototype auth mode must not be used for real users or live pilot deployments.

## Useful Commands

```bash
npm run build
npm run api
npm run preview
```

## Demo Notes

- Open `/#/school-demo` first. Parent and teacher flows are then available from the login screen.
- The government buyer brief is available from "View government buyer brief".
- The centre admin console is available from "Centre admin console".
- AI extraction is simulated in the frontend demo. A production version should route extraction through an approved backend with audit logging, access controls, and no API keys exposed to the browser.
- A lightweight Express API prototype is included under `server/`. It is intentionally simple and should be replaced with production authentication, a real database, and deployment controls before any live pilot.
