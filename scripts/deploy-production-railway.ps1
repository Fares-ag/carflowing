# Deploy CarFlow API (Railway) + frontends (Vercel) + bootstrap admin.
# Requires: railway login, Neon or Railway Postgres DATABASE_URL, Vercel CLI logged in.
#
# One-time Railway setup:
#   railway link          # project: carflow-api
#   railway service carflow-api
#   .\scripts\configure-railway-production.ps1   # needs BLOB_READ_WRITE_TOKEN + RESEND_API_KEY
#
# Usage:
#   $env:DATABASE_URL = "postgresql://..."
#   $env:BOOTSTRAP_ADMIN_EMAIL = "ops@yourdomain.com"
#   $env:BOOTSTRAP_ADMIN_PASSWORD = "choose-a-strong-password"
#   .\scripts\deploy-production-railway.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $env:DATABASE_URL) {
  Write-Host "DATABASE_URL not set locally — using Railway Postgres reference for migrate if linked."
  $env:DATABASE_URL = (railway variable list --service carflow-api --kv 2>$null | Select-String '^DATABASE_URL=').ToString().Split('=',2)[1]
  if (-not $env:DATABASE_URL) {
    Write-Error "Set DATABASE_URL or configure Railway variables first (see scripts/configure-railway-production.ps1)."
  }
}

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
  Write-Error "Install Railway CLI: https://docs.railway.com/guides/cli"
}

$who = railway whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error "Run 'railway login' first. $who"
}

Write-Host "Migrating production database..."
Push-Location $Root
npm run db:migrate --workspace=apps/backend
Pop-Location

Write-Host "Deploying API to Railway..."
Push-Location $Root
railway up --detach
if ($LASTEXITCODE -ne 0) { throw "railway up failed" }
Pop-Location

$domain = (railway domain 2>&1 | Select-String -Pattern 'https?://[^\s]+' | Select-Object -First 1)
if (-not $domain) {
  Write-Host "No public domain yet. Run 'railway domain' and set PUBLIC_API_URL on the service."
  $healthUrl = $null
} else {
  $healthUrl = "$($domain.Matches[0].Value.TrimEnd('/'))/health"
  Write-Host "Smoke check: $healthUrl"
  $health = Invoke-RestMethod -Uri $healthUrl -Method Get
  if ($health.status -ne "ok" -or $health.db -ne "connected") {
    Write-Error "Health check failed: $($health | ConvertTo-Json -Compress)"
  }
}

Write-Host "Deploying Vercel frontends..."
Push-Location $Root
npm run deploy:vercel
Pop-Location

if ($env:BOOTSTRAP_ADMIN_EMAIL -and $env:BOOTSTRAP_ADMIN_PASSWORD) {
  Write-Host "Bootstrapping production admin..."
  Push-Location $Root
  npm run bootstrap:admin --workspace=apps/backend -- `
    --email $env:BOOTSTRAP_ADMIN_EMAIL `
    --name $(if ($env:BOOTSTRAP_ADMIN_NAME) { $env:BOOTSTRAP_ADMIN_NAME } else { "Production Admin" }) `
    --password $env:BOOTSTRAP_ADMIN_PASSWORD
  Pop-Location
  Write-Host "Admin created: $env:BOOTSTRAP_ADMIN_EMAIL (password not printed)."
} else {
  Write-Host "Skip bootstrap: set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create the first admin."
}

if ($healthUrl) {
  Write-Host "Done. API health: $healthUrl"
} else {
  Write-Host "Done. Configure Railway env + domain, then curl https://<your-railway-domain>/health"
}
