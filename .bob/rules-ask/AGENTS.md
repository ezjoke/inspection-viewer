# Project Documentation Context (Non-Obvious Only)

- All UI labels, error messages, and validation text are in **French**, even though the code and comments are in English.
- `js/package.js` is the canonical reference for the `.inspection.json` file format — the README says so explicitly and the docs may lag behind the code.
- `demo/demo-site.inspection.json` is the only permitted committed site package; all others are git-ignored by pattern.
- The app has no build step — what you see in `js/` is exactly what runs in the browser.
- `private/` doesn't exist in the repo (git-ignored) — it's the intended location for real inspection data during local development.
- `tools/build_package.py` converts Excel reports to `.inspection.json`; it reads/masks in memory so no intermediate files are created.
