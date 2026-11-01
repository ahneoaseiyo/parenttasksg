# Local task persistence (development only)

The API normally uses synthetic in-memory data. To enable SQLite task persistence locally:

```bash
TASK_DB_PATH=./.local/parenttask.sqlite ENABLE_DEMO_AUTH=true npm run api
```

On Windows PowerShell:

```powershell
$env:TASK_DB_PATH=".local/parenttask.sqlite"
$env:ENABLE_DEMO_AUTH="true"
npm run api
```

Requires Node.js 22+ with the built-in `node:sqlite` module. The first startup creates schema migration 1 and seeds synthetic tasks only when the table is empty. Subsequent restarts preserve tasks. Keep the database outside source control; never commit it. This is **not** production authentication, encryption, or a production storage recommendation.

Only task CRUD is persisted in this phase. Broadcasts, messages, consent records, settings and audit events remain in memory. Back up or remove the local database deliberately; do not assume it is safe for real family data.
