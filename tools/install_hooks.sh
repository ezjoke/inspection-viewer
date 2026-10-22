#!/usr/bin/env bash
# Installs a pre-commit hook that runs tools/check_no_pii.sh.
# Git hooks are not versioned, so run this once after cloning or `git init`.
set -eu
cd "$(dirname "$0")/.."
[ -d .git ] || { echo "Not a git repository: run 'git init' first." >&2; exit 1; }
cat > .git/hooks/pre-commit <<'HOOK'
#!/usr/bin/env bash
exec "$(git rev-parse --show-toplevel)/tools/check_no_pii.sh"
HOOK
chmod +x .git/hooks/pre-commit
echo "pre-commit hook installed."
