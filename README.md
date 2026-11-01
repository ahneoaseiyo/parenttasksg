# ParentTask SG

React/Vite prototype for ParentTask SG, a Singapore-focused preschool parent task and consent workflow app.

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

## Useful Commands

```bash
npm run build
npm run api
npm run preview
```

## Demo Notes

- Parent and teacher flows are available from the login screen.
- The government buyer brief is available from "View government buyer brief".
- The centre admin console is available from "Centre admin console".
- AI extraction is simulated in the frontend demo. A production version should route extraction through an approved backend with audit logging, access controls, and no API keys exposed to the browser.
- A lightweight Express API prototype is included under `server/`. It is intentionally simple and should be replaced with authenticated routes, a real database, and production deployment controls before any live pilot.
