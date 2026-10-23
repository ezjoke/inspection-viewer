# Project Coding Rules (Non-Obvious Only)

- All strings from loaded JSON are HTML-escaped by `inert()` in `js/package.js` before reaching any view. Never double-escape — views must interpolate them raw into template literals.
- `&` is intentionally NOT escaped by `inert()` — don't add it; doing so would cause double-escaping on export→import roundtrips.
- New validation errors in `js/package.js` must use the local `fail(msg)` helper (throws `new Error`), not `throw` directly, and messages must be in French.
- Status colour keys and progress values are plain string constants — no enum/type system. Always pick from `SEVERITY_ORDER` (`'rouge'|'violet'|'bleu'|'orange'|'vert'|'inconnu'`) and `VALID_PROGRESS` (`'todo'|'planned'|'done'`).
- Real site data goes in `private/` (git-ignored). Never write test files or demo data outside `demo/`. The commit hook will reject files matching `private/denylist.txt` regex patterns.
- The app uses no bundler — imports must be relative paths to `.js` files (e.g. `./state.js`), not bare specifiers.
- Tests must be run via `npm test` (or `npx playwright test`), not directly with `node` — Playwright must start the Python HTTP server.
