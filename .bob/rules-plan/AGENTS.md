# Project Architecture Rules (Non-Obvious Only)

- **Trust boundary is `js/package.js`**: all untrusted file data is sanitised once on load. Views intentionally use `innerHTML` with template literals — this is safe by design, not a vulnerability, because all user-supplied strings are already HTML-escaped before reaching views.
- `appState` is a singleton with pub/sub (`subscribe(event, payload)`). Views are re-rendered imperatively by setting `innerHTML`; there is no reactive framework.
- `localStorage` has two keys: `INSPECTION_VIEWER_SITE` (the full package) and `INSPECTION_VIEWER_STATE` (filters, progress, notes). Storage version is 3 — changing the schema requires a migration or version bump.
- The `?src=` URL parameter is consumed and removed from the address bar on first load to prevent refetch on reload. A site already open requires user confirmation before being replaced.
- Playwright tests use Chromium only and start a Python HTTP server (`tools/serve.py`) automatically — there is no Node.js dev server.
- The commit hook enforces PII hygiene via regex patterns in `private/denylist.txt`; any architectural change touching text fields must consider whether new fields could contain identifiable data.
