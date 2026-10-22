# Status handoff — anonymize and make shareable

> Committed file: it must stay free of real identifying values (address, lot number, names, email).
> Real patterns live only in `private/denylist.txt` (git-ignored).
> Last updated by the agent that implemented Phases 1–2. Read `anonymize-and-share.md` first for the full plan.

## One-paragraph summary

The old public repo was deleted and recreated empty (Phase 0 done). In the local working copy, all real data was moved to `private/`, the app was converted from a generated bundle to ES modules, and it no longer contains any hard-coded site. It now loads a **site package** (`*.inspection.json`) from a file or from a fictional demo, validates it, and stores it in `localStorage`. It has been verified in a real browser (Playwright) and nothing has been committed or pushed yet.

## Done (all uncommitted, in the working tree)

| Area | What changed |
|---|---|
| Containment | Old remote deleted, new empty repo exists with the same name. Pages disabled. Cached copies expired (404). |
| Data separation | `private/` (git-ignored) holds the real report JSON, the plan image, a `layout.json` with the old hard-coded rooms and hotspots, `denylist.txt`, a masked export, and the original first-draft plan document. |
| Code | `js/app.js` (generated bundle) and `tools/build_bundle.py` deleted. New entry `js/main.js` loaded with `<script type="module">`. |
| `js/package.js` (new) | `normalizePackage()` validates untrusted JSON, makes `< > " '` inert in every string, restricts ids to `[A-Za-z0-9_.:-]`, accepts only base64 image data URLs, drops references to unknown item ids, and throws readable French errors. |
| `js/state.js` | Hard-coded rooms, hotspots, footprints and the single storage key removed. Added `loadSite()`, `restoreFromStorage()`, `exportSitePackage({includeProgress, includePlanImage})`, `resetProgress()`, `closeSite()`, `clearSiteData()`, `hasSite`. Storage keys `INSPECTION_VIEWER_SITE` (static part) and `INSPECTION_VIEWER_STATE` (layout and progress). Storage version 3. |
| `js/canvas.js`, `js/views.js` | Plan image and size come from `appState.sitePlan`, not a fixed 792×988 file. Removed the `'spot-maison'` default and the hard-coded building size. "APCHQ" wording removed from the legend headings. The user's pre-existing uncommitted undo/redo button edits in `views.js` were kept as they were. |
| `index.html` | Generic title, no data script, `type="module"`, nav, progress box and backup button hidden until a site is loaded. |
| `js/main.js` (new) | Start screen (open demo / open file), error display, header, keyboard shortcuts, export/import dialog with options, "clear progress" and "remove site from this browser". |
| Tools (now inside the repo at `tools/`) | `export_inspection_json.py` (path argument, `--mask-file`, masks `DV…`/`PA…` references, no JS output), `build_package.py` (one step: spreadsheet + optional layout + image → package, no intermediate files), `make_demo.py` (fictional house, 16 items, 3 levels, SVG plan), `check_no_pii.sh`. |
| Demo | `demo/demo-site.inspection.json` generated. Fully fictional. |
| Repo hygiene | `.gitignore` (ignores `private/`, spreadsheets, PDFs, zips, any `*.inspection.json` except the demo). README rewritten with no identifying text. `tools/check_no_pii.sh` passed once before Playwright files were added. |

### Verified so far (Node only, no browser)

- `loadSite`, `exportSitePackage`, `restoreFromStorage`, `closeSite`: round trip with the real 105-item data gives identical counts (12 rouge, 5 violet, 4 bleu, 40 orange, 32 vert, 12 inconnu).
- Invalid packages are rejected and leave the current site untouched (null, no schema, newer schema, no items, missing/duplicate/unsafe id, non-data-URL image, negative room size).
- Strings containing `<script>`/`<img onerror>` are neutralised and the operation is idempotent (no double escaping).
- The exporter run against the real spreadsheet with the denylist produces 105 items and 0 residual identifiers.

## Verification done since the first draft of this file

- Playwright (Chromium) suite in `tests/viewer.spec.js`, 9 tests, run with `npm test`: start screen, demo + all six views without console errors, plan image/hotspots/levels, progress persisting across reload, export/remove/re-import round trip, export options (no progress / no image), malformed files refused with the current site kept, and a hostile package rendered as text (no injected element, no dialog, no `window` side effect). Passed 4 consecutive full runs and 150 repeated start-screen loads.
- The real (private) package was built and opened in the browser: 105 items, 6 hotspots at 792×988, 3 levels, 8 unassigned interior items (same as the Node check), no console errors. Exporting it with "include plan image" unchecked really removes the image (`imageDataUrl: null`).
- The real package's text fields contain no denylist pattern (a hotspot name carrying the civic number was found and removed from `private/layout.json`). **Its embedded plan image still shows the lot number, civic number and dimensions** — never share it with the image included.
- The pre-commit hook blocks a commit containing a denylist pattern (tested with a temporary file).
- Flaky "stuck on Chargement…" test failures were traced to `python3 -m http.server` (listen backlog of 5 overflows when many ES modules load at once). `tools/serve.py` raises the backlog; use it instead.

## Phase 3 — done

- `check_no_pii.sh` OK and `npm test` 9/9 before starting.
- Old `.git` removed, `git init -b main`, identity set to the GitHub noreply address (repo-local config), hook installed, 22 files staged and reviewed (no `private/`, images, documents or `node_modules/`), one commit, remote re-added, pushed.
- Pages enabled through `gh api` (branch `main`, folder `/`), live at `https://<USER>.github.io/<REPO>/`.
- Live check (project Playwright, Chromium): page loads, "Ouvrir l’exemple" opens the fictional house, 0 console errors, 0 responses ≥ 400. Old `data/inspection.*`, `assets/terrain.png`, `js/app.js` return 404. Served files and commit contents contain no denylist pattern. The GitHub API shows the noreply address for author and committer.
- The denylist does match the author line of `git log` (one short pattern matches the noreply identity). This is expected, not a leak.
- Not automated: enabling "Block command line pushes that expose my email" in GitHub email settings. Do it by hand.
- The Playwright MCP browser is not installed on this machine (needs Chrome); use the project's own `node_modules/playwright` for live checks.

- `private/` now holds only: `denylist.txt`, `layout.json`, `plan.png`, `real.inspection.json` (the package to test with) and the original plan draft. The intermediate exports and a scratch script were deleted.

## Remaining steps

1. Enable the GitHub email-privacy push block (manual).
2. **Optional follow-ups:**
   - A GitHub Action that runs the generic part of `check_no_pii.sh` and `npm test` (the denylist is not available in CI, so the personal-pattern check stays local).
   - Escape the personal note in `openDetailDrawer` (`views.js`) so `</textarea>` in a note cannot break the drawer.
   - Sharing route B (Google Drive API), only if manual sharing proves too clumsy. Route C (`?src=` URL) is done.
   - Per-site configuration screens (levels, footprints, status scale, item editor, plan image upload) — the follow-up project that motivated all this.

## Known issues and decisions to keep in mind

- **Notes display quirk:** notes typed by the user are stored raw, but after an export/import they pass through the sanitiser, so `<` appears as `&lt;` in the notes box. Harmless. Typing `</textarea>` in a note can break the drawer layout for that user only. Fix by escaping the note in the template in `openDetailDrawer` if desired.
- **Legacy data:** the old storage key `INSPECTION_VIEWER_V2` is not migrated (the user's real progress was minimal and the old format cannot be mapped without the old defaults). If the user cares, export their progress by hand from the old app before clearing it, or write a one-off script.
- **`file://` no longer works** (ES modules). Documented in the README. Pages and `python3 -m http.server` are the supported ways to run it.
- **Language:** UI is French only; strings are inline.
- **Sharing:** only the manual Google Drive route (export file, share with named people) is implemented. Drive API and `?src=` URL loading are not.
- **Tools were moved:** the parent folder's `tools/` and `inspection-viewer-plan.md` no longer exist; the scripts now live in `inspection-viewer/tools/`. The parent folder's spreadsheet/PDF/zip/numbers/survey files are outside the repo and must stay there.
- **Do not read or print the contents of `private/` into committed files or logs.** It contains the real report and the denylist.

## How to resume quickly

```bash
cd inspection-viewer
python3 tools/serve.py             # then open http://localhost:8765
npm test                           # Playwright suite (starts its own server)
tools/check_no_pii.sh              # must print "check_no_pii: OK"
python3 tools/make_demo.py         # regenerate the demo
node --input-type=module -e "import('./js/package.js').then(m=>console.log(Object.keys(m)))"   # quick module check
```

