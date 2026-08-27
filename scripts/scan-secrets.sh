#!/usr/bin/env bash
# Hardcoded-secret scan used by .github/workflows/test.yml (job: secret-scan).
#
# The previous inline scan matched secret *identifiers* (`process.env.RESEND_API_KEY`,
# `throw new Error('RESEND_API_KEY must be set...')`) and therefore never passed.
# This one matches assigned secret *values*: a literal of meaningful length that is
# actually bound to a secret-looking name, either quoted in source or unquoted in
# env/doc files. Placeholder values (`<...>`, `change-me`, `your-...`, `${{ ... }}`)
# are filtered out so the gate stays green on a clean tree and only fires on a real
# credential.
#
# Usage:
#   bash scripts/scan-secrets.sh            # scan the working tree, exit 1 on a hit
#
# Exit codes: 0 = clean, 1 = potential secret found, 2 = tooling missing.

set -uo pipefail

# --- ripgrep must exist. The old scan was written as `! rg ... || (... exit 1)`,
# --- which silently PASSED when rg was absent from the runner.
if ! command -v rg >/dev/null 2>&1; then
  echo "secret-scan: ripgrep (rg) is not installed on this runner."
  echo "secret-scan: refusing to report a pass without actually scanning."
  echo "secret-scan: install it (e.g. 'sudo apt-get install -y ripgrep') and re-run."
  exit 2
fi
rg --version | head -n 1

# Secret-looking names. Deliberately NOT bare 'key' or 'id' — those match ordinary code.
NAMES='(api[-_]?key|secret|token|password|passwd|credential|webhook[-_]?key|private[-_]?key|access[-_]?key|client[-_]?secret|auth[-_]?token)'

# A quoted literal of >= 16 chars bound to a secret-looking name, in real source.
CODE_RE="(?i)${NAMES}[\"']?\s*[:=]\s*[\"'\`][A-Za-z0-9._~+/=-]{16,}[\"'\`]"

# Same names plus the SkipCash-style identifiers that must never be pasted into docs.
ENV_NAMES="(${NAMES}|client[-_]?id|key[-_]?id)"

# An unquoted VALUE of >= 16 chars bound to a secret-looking env var, in env/doc files.
# Commented-out lines are scanned too: the SkipCash ids that leaked lived in comments.
ENV_RE="(?i)^\s*#?\s*[A-Z0-9_]*${ENV_NAMES}[A-Z0-9_]*\s*=\s*[^\s\"'#]{16,}"

# Values that are obviously not credentials. Note this filter sees the whole `path:line:text`
# match, so it must not contain a token that appears in a scanned PATH — bare `example`
# would silently exempt the entire .env.example file.
PLACEHOLDER='(<|\.\.\.|change[-_]?me|changeme|your[-_]|choose[-_]|placeholder|redacted|rotate|xxxx|\$\{|\{\{|\$env:|process\.env|secrets\.|TODO|example\.(com|org|net)|@example)'

CODE_PATHS=(apps packages src api scripts e2e)
ENV_PATHS=(.env.example docs .github README.md)

CODE_EXCLUDES=(
  --glob '!**/node_modules/**'
  --glob '!**/dist/**'
  --glob '!**/*.test.*'
  --glob '!**/__tests__/**'
  --glob '!**/mocks/**'          # MSW fixtures: fake tokens by design
  --glob '!**/seed.ts'           # dev seed data, never run in production
)

# rg errors are suppressed below (a no-match exit 1 is normal), so a path that has been
# renamed away would otherwise shrink the scan silently — exactly the failure mode this
# job is being fixed for.
for target in "${CODE_PATHS[@]}" "${ENV_PATHS[@]}"; do
  if [ ! -e "$target" ]; then
    echo "secret-scan: scan target '$target' does not exist — refusing to scan a shrunken tree."
    echo "secret-scan: update CODE_PATHS/ENV_PATHS in this script if the layout changed."
    exit 2
  fi
done

hits=$(
  {
    rg --no-heading --line-number "$CODE_RE" "${CODE_PATHS[@]}" "${CODE_EXCLUDES[@]}" 2>/dev/null
    rg --no-heading --line-number "$ENV_RE" "${ENV_PATHS[@]}" --glob '!**/node_modules/**' 2>/dev/null
  } | rg -v -i "$PLACEHOLDER" || true
)

if [ -n "$hits" ]; then
  echo "secret-scan: potential hardcoded secret(s) found:"
  echo "$hits"
  echo ""
  echo "Move the value to an environment variable and rotate it if it was ever committed."
  echo "See scripts/rotate-and-purge-secrets.md."
  exit 1
fi

echo "secret-scan: clean — no assigned secret values found."
