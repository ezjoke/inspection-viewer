#!/usr/bin/env bash
# Fails if anything identifying could be published.
#
#   tools/check_no_pii.sh
#
# Two kinds of checks:
#   1. Personal patterns from private/denylist.txt (git-ignored, never published).
#      One case-insensitive extended regex per line; '#' starts a comment.
#   2. Generic rules that need no private file (so they also work in CI):
#      forbidden file types, images/packages outside demo/, embedded data URLs.
#
# Checked content = tracked files + untracked files that are not ignored.

set -u
cd "$(dirname "$0")/.."

fail=0
say() { printf '%s\n' "$*" >&2; }

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  files=$( { git ls-files; git ls-files --others --exclude-standard; } | sort -u )
else
  say "Not a git repository yet: checking the working tree except private/ and .git/."
  files=$(find . -type f -not -path './private/*' -not -path './.git/*' | sed 's|^\./||')
fi
files=$(printf '%s\n' "$files" | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done)

# --- 1. personal denylist ---------------------------------------------------
if [ -f private/denylist.txt ]; then
  patterns=$(grep -v -E '^[[:space:]]*(#|$)' private/denylist.txt)
  if [ -n "$patterns" ]; then
    patfile=$(mktemp); printf '%s\n' "$patterns" > "$patfile"
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      case "$f" in *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico) continue ;; esac
      if grep -q -i -E -f "$patfile" -- "$f" 2>/dev/null; then
        say "DENYLIST HIT in $f:"
        grep -n -i -E -f "$patfile" -- "$f" | cut -c1-140 | head -3 >&2
        fail=1
      fi
    done <<EOT
$files
EOT
    rm -f "$patfile"
  fi
else
  say "WARNING: private/denylist.txt not found; personal patterns were NOT checked."
fi

# --- 2. generic rules --------------------------------------------------------
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    demo/demo-site.inspection.json) ;;
    demo/*) say "UNEXPECTED FILE IN demo/: $f"; fail=1 ;;
    *.pdf|*.xlsx|*.xls|*.numbers|*.zip|*.docx) say "FORBIDDEN FILE TYPE: $f"; fail=1 ;;
    *.png|*.jpg|*.jpeg|*.gif|*.webp) say "IMAGE OUTSIDE demo/: $f"; fail=1 ;;
    *.inspection.json) say "SITE PACKAGE OUTSIDE demo/: $f"; fail=1 ;;
  esac
  case "$f" in demo/*) continue ;; esac
  if grep -q -E 'data:image/[a-z+]+;base64,[A-Za-z0-9+/=]{200,}' -- "$f" 2>/dev/null; then
    say "EMBEDDED IMAGE DATA in $f"; fail=1
  fi
done <<EOT
$files
EOT

if [ "$fail" -eq 0 ]; then say "check_no_pii: OK"; else say "check_no_pii: FAILED"; fi
exit "$fail"
