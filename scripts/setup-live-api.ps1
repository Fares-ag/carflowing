# One-time setup: deploy CarFlow API to Vercel and wire frontends to it.
# Requires: vercel CLI logged in, Neon DATABASE_URL in env or passed below.
#
# Usage:
#   $env:DATABASE_URL = "postgresql://..."
#   .\scripts\setup-live-api.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $env:DATABASE_URL) {
  Write-Error "Set DATABASE_URL to your Neon connection string before running."
}

$ApiUrl = "https://carflow-api.vercel.app"
$CustomerUrl = "https://carflow-customer.vercel.app"
$AdminUrl = "https://carflow-admin-pied.vercel.app"
$DealerUrl = "https://carflow-dealer.vercel.app"

if (-not $env:JWT_ACCESS_SECRET) {
  $env:JWT_ACCESS_SECRET = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
}
if (-not $env:JWT_REFRESH_SECRET) {
  $env:JWT_REFRESH_SECRET = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
}

Write-Host "Migrating database..."
Push-Location $Root
npm run db:migrate --workspace=apps/backend
npm run db:seed --workspace=apps/backend
Pop-Location

Write-Host "Setting carflow-api production env..."
Push-Location (Join-Path $Root "apps/backend")
$apiEnv = @{
  DATABASE_URL = $env:DATABASE_URL
  JWT_ACCESS_SECRET = $env:JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET = $env:JWT_REFRESH_SECRET
  COOKIE_SECURE = "true"
  CORS_ORIGINS = "$CustomerUrl,$AdminUrl,$DealerUrl"
  PUBLIC_API_URL = $ApiUrl
  CUSTOMER_APP_URL = $CustomerUrl
  DEALER_APP_URL = $DealerUrl
  UPLOAD_DRIVER = "local"
  ENABLE_JOBS = "false"
  FROM_EMAIL = "noreply@carflow.dev"
}
foreach ($entry in $apiEnv.GetEnumerator()) {
  $entry.Value | vercel env add $entry.Key production 2>$null
}
Pop-Location

Write-Host "Deploying API..."
Push-Location $Root
vercel deploy . --prod --project carflow-api --local-config apps/backend/vercel.json --yes
Pop-Location

Write-Host "Updating frontend env (live API, mock off)..."
foreach ($portal in @(
  @{ Name = "carflow-customer"; Config = "apps/customer/vercel.json" },
  @{ Name = "carflow-admin"; Config = "apps/admin/vercel.json" },
  @{ Name = "carflow-dealer"; Config = "apps/dealer/vercel.json" }
)) {
  Push-Location $Root
  vercel env rm VITE_USE_MOCK_API production --project $portal.Name --yes 2>$null
  "false" | vercel env add VITE_USE_MOCK_API production --project $portal.Name
  vercel env rm VITE_API_URL production --project $portal.Name --yes 2>$null
  "$ApiUrl/api" | vercel env add VITE_API_URL production --project $portal.Name
  vercel deploy . --prod --project $portal.Name --local-config $portal.Config --yes
  Pop-Location
}

Write-Host "Done. API: $ApiUrl/health"
Write-Host "Demo login: customer@carflow.dev / password123"
