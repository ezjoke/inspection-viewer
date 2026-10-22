# Plan — Anonymize the viewer and make it shareable

> **This file is committed to the public repo, so it must never contain real identifying values.**
> It uses placeholders (`<ADDRESS>`, `<LOT>`, `<EMAIL>`, …). The real values live only in
> `private/denylist.txt`, which is git-ignored (see Phase 1).

## Goal

1. Remove all identifying data about the inspected property and the owner from the code, data, image, and git history.
2. Turn the app from "one hard-coded site" into a generic tool that ships with a fictional demo and loads real sites from a local file.
3. Let a site be shared with someone else as a single file (manually through Google Drive first, API integration optional).

## Non-goals

- No backend, accounts, or server-side storage.
- No automatic redaction of arbitrary third-party reports. The scrubbing tool handles known patterns and a denylist, and a human still reviews the output.
- Per-site configuration (levels, footprints, status scale, item editor) is the follow-up project. This plan only does the groundwork it needs (site package format, no hard-coded data).

## Findings (audit of the current repo)

| Leak | Where | Fix |
|---|---|---|
| Street address | `index.html` (title, `<h1>`), `README.md`, `data/inspection.{js,json}` (`meta.title`, `meta.sourceExcel`), `js/state.js` (hotspot name), `js/app.js` (hotspot name, backup filename) | Replace with generic text; read title from the loaded site |
| Cadastral lot number, civic number, exact lot dimensions | Pixels of `assets/terrain.png` (text search cannot find them) | Remove the image; demo uses a generic plan |
| Seller-declaration and purchase-offer reference numbers | Report text in `data/inspection.*` | Mask by regex in the export tool |
| Author name and email | Git commit metadata | Fresh repo, noreply email |
| Everything above plus the full report | Git history of the current repo | Fresh repo; delete the old one |
| Source files (PDF, spreadsheet, Numbers file, zip, survey PDF) | Parent folder, outside the repo | Never add to a repo; keep under `private/` |

The report's "Coordonnées et certificat" entry is empty, so the inspector's details are not in the data. The rest of the report text is generic boilerplate.

## Target layout

```
inspection-viewer/
  index.html
  style.css
  js/                       # app code, no site data
  demo/
    demo-site.inspection.json   # fictional house, the only data in the repo
  docs/plans/                # this plan
  tools/
    export_inspection_json.py   # takes input path as argument, masks patterns
    check_no_pii.sh             # reads patterns from private/denylist.txt
  private/                   # GIT-IGNORED: real data, image, denylist, sources
  .gitignore
```

---

## Phase 0 — Containment

**Intent.** Stop the exposure before touching code.

**Todo.**
1. Delete (or make private) the current remote repo. This also removes its Pages site.
2. Confirm the old Pages URLs return 404 for the data file and the image.
3. Note that the old repo's commit may remain cached on GitHub for a while after deletion. Treat the data as having been public.

**Status.** `[x]` Old repo deleted and recreated empty (verified: no commits, no contents, old commit SHA not found, Pages disabled). Remaining: confirm the cached Pages copy has expired (served with `max-age=600`).

**Note.** The new repo reuses the old name, so the old URLs now point at it. The local `.git` still holds the old commit and its remote. Do not push it; Phase 3 replaces it with a fresh `git init`.

---

## Phase 1 — Separate code from data

**Intent.** Make it structurally impossible to commit real data again.

**Todo.**
1. Create `private/` and move into it: the real `inspection.js` / `inspection.json`, the site plan image, and any package built from them.
2. Add `.gitignore` entries: `private/`, `*.xlsx`, `*.numbers`, `*.pdf`, `*.zip`, `*.local.*`.
3. Create `private/denylist.txt` with one regex per line (address, lot number, civic number, document references, email, surnames). It is git-ignored, so the patterns themselves never leak.
4. Remove the hard-coded default rooms, item-to-room assignments, and site-plan hotspots from the `AppState` constructor in `js/state.js`. They reference item IDs of one specific report. The constructor starts with one empty level and no hotspots.
5. Change `loadData()` so it no longer requires `window.INSPECTION_DATA` or `data/inspection.json` in the repo. With nothing loaded, show a start screen: **Open demo** / **Open a site file**.
6. Stop loading `data/inspection.js` from `index.html`.

**Expected outcome.** The repo contains zero real-site data; the app runs from a loaded package.

**Status.** `[x]` Done in the working tree (not yet committed). `private/` holds real data; the app has no built-in site; `.gitignore` in place.

---

## Phase 2 — Scrub code and tooling

**Intent.** Remove remaining identifiers and make removal checkable.

**Todo.**
1. Replace the address in `index.html`, `README.md`, `js/state.js` and the bundle. The header title and subtitle come from the loaded site's name (generic placeholder when none).
2. Change the backup filename to `inspection-backup-<date>.json`.
3. Remove `meta.sourceExcel` from the exported data.
4. Update `tools/export_inspection_json.py`: take the spreadsheet path as a command-line argument, and mask document reference numbers and anything matching `private/denylist.txt` in all text fields.
5. Rebuild `js/app.js` with `tools/build_bundle.py` (or drop the bundle, see Open questions).
6. Write `tools/check_no_pii.sh`: runs `git grep -i -E -f private/denylist.txt` over tracked files and exits non-zero on any hit. Also checks that no tracked file is larger than a threshold and that no image is committed outside `demo/`.
7. Run the check as a git pre-commit hook. Add a GitHub Action later that runs the generic checks only (the denylist is not available in CI).

**Expected outcome.** `check_no_pii.sh` passes on a clean tree and fails when an identifier is re-introduced.

**Status.** `[x]` Done in the working tree. Address and filename removed from code and README, exporter masks references and denylist patterns, `tools/check_no_pii.sh` passes, pre-commit hook installer in `tools/install_hooks.sh`. GitHub Action not added (see status.md).

---

## Phase 3 — Fresh repository

**Intent.** Leave no trace in history.

**Todo.**
1. Do this only after Phases 1–2 pass the check.
2. Set a noreply identity before the first commit: `git config user.name` and `git config user.email "<id>+<user>@users.noreply.github.com"`. Also enable "Block command line pushes that expose my email" in GitHub email settings.
3. Remove the old history from the local copy: delete `inspection-viewer/.git` and run `git init` (or copy the clean tree into a new directory), then make a single commit.
4. Create the new remote repo under a neutral name (no address or place name). Push.
5. Enable GitHub Pages on the new repo.
6. Check the live site: the page, `view-source`, and every file under `demo/` contain no identifiers.

**Status.** `[x]` Done. Fresh `git init`, single commit authored with the GitHub noreply address, pushed to the new empty repo, Pages enabled (branch `main`, folder `/`). Live site checked: the demo opens with no console errors or failed requests, the old data/image paths return 404, and served files and commit contents have no denylist hit. Remaining manual step: enable "Block command line pushes that expose my email" in GitHub email settings (no API for it).

---

## Phase 4 — Demo site and site package format

**Intent.** Ship something useful with no real data, and define the file people exchange.

**Site package** (`*.inspection.json`):

```
{
  "schema": 1,
  "site":        { "name": "...", "notes": "..." },
  "statusScale": [ { "key", "label", "color", "icon", "rank", "needsAction" } ],
  "items":       [ { "id", "zone", "article", "status", "trade", "urgency",
                     "costEstimate", "bullets", "page", "isExterior" } ],
  "levels":      [ { "id", "name", "footprint": {"width","height"}, "rooms": [ ... ] } ],
  "sitePlan":    { "imageDataUrl": "data:image/...", "width", "height", "hotspots": [ ... ] },
  "userState":   { "progress": {}, "notes": {}, "deletedItemIds": [] }
}
```

- This extends the existing backup format, which today holds only user state (progress, floor plans, hotspots, deleted items) and not the items themselves.
- The image is embedded as a data URL so the package is one self-contained file.
- `schema` is versioned; an unknown version produces a warning instead of silently dropping data.

**Todo.**
1. Define the schema above and write load/validate code in `js/state.js` (reject malformed files with a readable error).
2. Write `demo/demo-site.inspection.json`: a fictional two-level house with about 15 invented items across several zones, a few rooms, and a generic plan drawn as a simple SVG-based image. No real lot, address, or measurements.
3. Backup dialog: **Export site package** with two checkboxes: *include progress and notes*, *include plan image*. This allows sharing a clean copy without personal notes.
4. **Open a site file** and **Open demo** on the start screen. Remember the last-opened site in `localStorage`.
5. Migrate existing user state: if a legacy storage key exists, offer to attach it to the next loaded site.

**Expected outcome.** A site round-trips through export, clear storage, and import with identical content.

**Status.** `[~]` Mostly done: schema and validator (`js/package.js`), fictional demo, start screen, export options. Not done: migration of the old storage key (dropped on purpose).

---

## Phase 5 — Sharing through Google Drive

A static page cannot fetch a Drive "anyone with the link" file directly, because Drive does not send CORS headers.

| Route | Effort | Notes |
|---|---|---|
| **A. Manual** | Small | Put the package in a shared Drive folder; the recipient downloads it and uses **Open a site file**. No accounts or keys in the app. |
| **B. Drive API** | Medium | **Open from Drive** / **Save to Drive** using Google Identity Services and the Picker with the `drive.file` scope. Needs a Google Cloud OAuth client ID with the Pages URL registered. Google's consent screen shows an "unverified app" warning until verified. |
| **C. URL loading** (`?src=https://...`) | Small | Works for hosts that allow CORS (for example a Gist or raw file), not for Drive. |

**Todo.**
1. Implement route A first: document the sharing steps in the README (export package, upload to Drive, share with named people, recipient imports).
2. Optionally add route C, restricted to `https:` URLs and validated with the same schema check.
3. Decide on route B after A is in use. If built, keep the OAuth client ID in a config file and never request broader scopes than `drive.file`.

**Sharing guidance.**
- Share with named people, not "anyone with the link"; the package contains the full report and the plan.
- Use *include progress and notes* only when you want the recipient to see your notes.

**Status.** `[x]` Route A documented in the README. Route C built: `?src=<https URL>` in `js/main.js` (https only, same validation as a local file, confirmation before replacing an open site, parameter removed from the address bar, CORS failure explained), 4 Playwright tests. Route B (Drive API) deliberately not built: decide after route A has been used.

---

## Verification checklist (before announcing the new site)

- [x] `tools/check_no_pii.sh` passes (current tree)
- [x] Case-insensitive search of the working tree for each denylist pattern returns nothing
- [x] Commit author on the new repo shows the noreply email
- [x] Live site opens the demo with no network errors
- [x] No file in the repo is a PDF, spreadsheet, zip, or non-demo image
- [x] Export, clear storage, import round trip works (Playwright, `tests/viewer.spec.js`)
- [x] Old repo deleted and old Pages URLs return 404

## Open questions

1. ~~Keep `file://` support or switch to ES modules?~~ Decided: ES modules (needs Pages or `tools/serve.py`).
2. Is Google Drive route A enough, or is the Drive API (route B) wanted? Left open until route A has been used.
3. Language: keep the UI French only, or add an English string table later?
