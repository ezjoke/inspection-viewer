# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Stack

Vanilla JS (ES modules, no bundler, no TypeScript), Playwright for tests. Single-page app served over HTTP — **do not open `index.html` directly as a file** (ES modules require `http(s)://`).

## Commands

```bash
# Local dev server (required before opening in browser or running tests)
python3 tools/serve.py          # serves on http://localhost:8765

# Tests (Playwright auto-starts the server if not already running)
npm test                        # all tests
npx playwright test --grep "export"    # run a single test by name substring

# Before committing
tools/check_no_pii.sh           # fails if denylist patterns found; install hook: tools/install_hooks.sh

# Build a real site package from an Excel report (output stays in private/)
python3 tools/build_package.py rapport.xlsx --out private/site.inspection.json
```

## Critical constraints

- **`private/` is git-ignored** — real inspection data lives there, never in the repo. Only `demo/demo-site.inspection.json` may be committed.
- **All `*.inspection.json` files are git-ignored** except the one demo file (enforced by `.gitignore`).
- The pre-commit hook rejects any file matching patterns in `private/denylist.txt` (one regex per line).

## Architecture

- `js/package.js` — validates and normalises untrusted JSON input. **All string values from a loaded file are HTML-escaped here** (`inert()`) so views can safely interpolate them into template literals. The `&` character is deliberately NOT escaped to keep export→import idempotent.
- `js/state.js` — singleton `appState`, pub/sub with `subscribe()`. Persists to `localStorage` under keys `INSPECTION_VIEWER_SITE` / `INSPECTION_VIEWER_STATE` (storage version 3).
- `js/views.js` — renders views by setting `innerHTML` on `#main-view-content`. Uses template literals with data already sanitised by `package.js`.
- `js/main.js` — entry point, wires navigation and `?src=` URL loading.
- `js/canvas.js` — SVG-based plan canvas (site plan and floor plan).

## Code style

- Plain JS with `// @ts-check` JSDoc annotations (no compiled TypeScript).
- Error messages and UI strings are in **French**.
- Validation errors thrown as `new Error(frenchMessage)` via a local `fail()` helper in `package.js`.
- Status/severity colour keys: `'rouge' | 'violet' | 'bleu' | 'orange' | 'vert' | 'inconnu'` (see `SEVERITY_ORDER` in `state.js`).
- Item progress values: `'todo' | 'planned' | 'done'` (see `VALID_PROGRESS` in `package.js`).

## Testing notes

- Tests load `demo/demo-site.inspection.json` directly from disk via `fs.readFileSync` (Node import, not fetch).
- The `watchErrors()` helper in `tests/viewer.spec.js` captures `pageerror` and `console.error`; most tests assert `errors.toEqual([])`.
- Playwright is configured for **Chromium only** (`playwright.config.js`).
- `baseURL` is `http://127.0.0.1:8765`; the web server command is `python3 tools/serve.py 8765`.
