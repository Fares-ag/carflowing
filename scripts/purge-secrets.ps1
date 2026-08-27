# Strip leaked credentials from git history with git-filter-repo.
#
# THIS PERFORMS STEP (b) OF scripts/rotate-and-purge-secrets.md AND NOTHING ELSE.
# It rewrites history in the CURRENT repository. It never pushes, never adds a
# remote, and never touches the SkipCash portal. Read the runbook first - rotating
# the credentials comes FIRST and is the part that actually ends the exposure.
#
# Preconditions (the script checks all of them and refuses otherwise):
#   1. Credentials already rotated in the SkipCash portal      -- runbook section 1
#   2. COMPROMISED_SKIPCASH_VALUES converted to hashes         -- runbook section 2.0
#   3. Running inside a FRESH clone, not your working checkout -- runbook section 2.2
#   4. A replacements file OUTSIDE any git working tree        -- runbook section 2.3
#
# Usage:
#   .\scripts\purge-secrets.ps1 -ReplacementsFile ~/carflow-secret-replacements.txt --i-understand
#
# Without the literal --i-understand flag the script explains itself and exits 2.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ReplacementsFile,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

$ErrorActionPreference = "Stop"

if ($Rest -notcontains '--i-understand') {
  Write-Host ""
  Write-Host "purge-secrets: refusing to run without --i-understand."
  Write-Host ""
  Write-Host "This rewrites every commit in this repository. Afterwards:"
  Write-Host "  * every existing clone of this repo is broken and must be re-cloned"
  Write-Host "  * every open pull request is invalidated"
  Write-Host "  * the old objects REMAIN on GitHub via refs/pull/* and forks until"
  Write-Host "    GitHub Support garbage-collects them"
  Write-Host "  * none of it un-leaks the credential - rotation does that, and it"
  Write-Host "    must already be done (scripts/rotate-and-purge-secrets.md, section 1)"
  Write-Host ""
  Write-Host "Re-run with --i-understand once the runbook's section 1 is complete."
  exit 2
}

if (-not (Get-Command git-filter-repo -ErrorAction SilentlyContinue)) {
  Write-Error "git-filter-repo is not installed. Install it: pipx install git-filter-repo"
}

$repoRoot = (git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
  Write-Error "Not inside a git repository."
}
$repoRoot = $repoRoot.Trim()

# The replacements file holds the secrets in cleartext. It must not live inside a
# working tree, or the purge commits the very values it is removing.
if (-not (Test-Path -LiteralPath $ReplacementsFile)) {
  Write-Error "Replacements file not found: $ReplacementsFile (see runbook section 2.3)"
}
$replacements = (Resolve-Path -LiteralPath $ReplacementsFile).Path
if ($replacements.StartsWith((Resolve-Path -LiteralPath $repoRoot).Path, [StringComparison]::OrdinalIgnoreCase)) {
  Write-Error "Replacements file is inside the repository ($replacements). Move it outside - it contains the secrets in cleartext."
}
if (-not (Get-Content -LiteralPath $replacements | Where-Object { $_.Trim() -and -not $_.TrimStart().StartsWith('#') })) {
  Write-Error "Replacements file has no expressions in it: $replacements"
}

# Rewriting HEAD's blobs would blank the burned-key denylist and silently disable the
# production boot guard. The runbook (section 2.0) converts it to hashes first.
$guard = Join-Path $repoRoot "apps/backend/src/utils/productionGuards.ts"
if (Test-Path -LiteralPath $guard) {
  if (Select-String -LiteralPath $guard -Pattern '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' -Quiet) {
    Write-Error "productionGuards.ts still holds the burned webhook keys verbatim. Convert COMPROMISED_SKIPCASH_VALUES to SHA-256 hashes first (runbook section 2.0), or this rewrite will neuter the boot guard."
  }
}

$dirty = git status --porcelain
if ($dirty) {
  Write-Error "Working tree is not clean. git-filter-repo must run on a pristine fresh clone (runbook section 2.2)."
}

Write-Host "Repository:   $repoRoot"
Write-Host "Replacements: $replacements"
Write-Host "Rewriting history (git filter-repo --replace-text --sensitive-data-removal)..."

# --sensitive-data-removal prints the hash of the first changed commit, which the
# runbook's verification step (section 4) feeds to `git cat-file -t`.
git filter-repo --replace-text "$replacements" --sensitive-data-removal
if ($LASTEXITCODE -ne 0) { throw "git filter-repo failed with exit code $LASTEXITCODE" }

Write-Host ""
Write-Host "History rewritten. NOTHING HAS BEEN PUSHED - that is deliberate."
Write-Host ""
Write-Host "Next, by hand:"
Write-Host "  1. Delete the replacements file: Remove-Item -LiteralPath '$replacements'"
Write-Host "  2. Verify locally           -- scripts/rotate-and-purge-secrets.md, section 4"
Write-Host "  3. Warn every collaborator  -- section 3 (their clones are about to break)"
Write-Host "  4. Only then force-push     -- section 3"
Write-Host "  5. Open a GitHub Support ticket to purge refs/pull/* and forks -- section 3"
