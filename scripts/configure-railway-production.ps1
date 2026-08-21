# Configure Railway production variables for carflow-api.
# Run after: railway link (project carflow-api) && railway service carflow-api
#
# Required env vars before running (do NOT commit these):
#   $env:BLOB_READ_WRITE_TOKEN = "..."
#   $env:RESEND_API_KEY = "..."
# Optional Neon override (default: Railway Postgres reference):
#   $env:DATABASE_URL = "postgresql://..."  # omit to use ${{Postgres.DATABASE_URL}}
#
# Usage:
#   .\scripts\configure-railway-production.ps1

$ErrorActionPreference = "Stop"

if (-not $env:BLOB_READ_WRITE_TOKEN) { Write-Error "Set BLOB_READ_WRITE_TOKEN" }
if (-not $env:RESEND_API_KEY) { Write-Error "Set RESEND_API_KEY" }

$api = $env:PUBLIC_API_URL
if (-not $api) {
  $domainJson = railway domain list --service carflow-api --json 2>$null | ConvertFrom-Json
  $api = ($domainJson | Select-Object -First 1).domain
  if (-not $api) { Write-Error "Set PUBLIC_API_URL or run 'railway domain' first" }
}

function Default-Env([string]$Name, [string]$Fallback) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ($value) { return $value }
  return $Fallback
}

$customer = Default-Env 'CUSTOMER_APP_URL' 'https://www.carflow.qa'
$admin = Default-Env 'ADMIN_APP_URL' 'https://carflow-admin-pied.vercel.app'
$dealer = Default-Env 'DEALER_APP_URL' 'https://carflow-dealer.vercel.app'
$cookieDomain = Default-Env 'COOKIE_DOMAIN' '.carflow.qa'
$fromEmail = Default-Env 'FROM_EMAIL' 'noreply@carflow.qa'

if (-not $env:JWT_ACCESS_SECRET) {
  $env:JWT_ACCESS_SECRET = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
}
if (-not $env:JWT_REFRESH_SECRET) {
  $env:JWT_REFRESH_SECRET = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
}
if (-not $env:JWT_2FA_SECRET) {
  $env:JWT_2FA_SECRET = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
}

# Never copy a laptop TCP-proxy URL (127.0.0.1:15432) into Railway.
# The API container cannot reach that address; use the private Postgres reference.
$dbUrl =
  if ($env:DATABASE_URL -and $env:DATABASE_URL -notmatch '127\.0\.0\.1|localhost') {
    $env:DATABASE_URL
  } else {
    'postgresql://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@postgres.railway.internal:5432/${{Postgres.POSTGRES_DB}}'
  }

$vars = @(
  "DATABASE_URL=$dbUrl",
  "NODE_ENV=production",
  "ENABLE_JOBS=true",
  "UPLOAD_DRIVER=blob",
  "BLOB_READ_WRITE_TOKEN=$($env:BLOB_READ_WRITE_TOKEN)",
  "RESEND_API_KEY=$($env:RESEND_API_KEY)",
  "FROM_EMAIL=$fromEmail",
  "JWT_ACCESS_SECRET=$($env:JWT_ACCESS_SECRET)",
  "JWT_REFRESH_SECRET=$($env:JWT_REFRESH_SECRET)",
  "JWT_2FA_SECRET=$($env:JWT_2FA_SECRET)",
  "COOKIE_SECURE=true",
  "COOKIE_DOMAIN=$cookieDomain",
  "PUBLIC_API_URL=$api",
  "CUSTOMER_APP_URL=$customer",
  "ADMIN_APP_URL=$admin",
  "DEALER_APP_URL=$dealer",
  "CORS_ORIGINS=https://www.carflow.qa,https://carflow.qa,$customer,$admin,$dealer,https://carflow-customer.vercel.app,https://carflow-admin-pied.vercel.app,https://carflow-dealer.vercel.app",
  "SKIPCASH_MODE=sandbox"
)

if ($env:SKIPCASH_CLIENT_ID) { $vars += "SKIPCASH_CLIENT_ID=$($env:SKIPCASH_CLIENT_ID)" }
if ($env:SKIPCASH_KEY_ID) { $vars += "SKIPCASH_KEY_ID=$($env:SKIPCASH_KEY_ID)" }
if ($env:SKIPCASH_KEY_SECRET) { $vars += "SKIPCASH_KEY_SECRET=$($env:SKIPCASH_KEY_SECRET)" }
if ($env:SKIPCASH_WEBHOOK_KEY) { $vars += "SKIPCASH_WEBHOOK_KEY=$($env:SKIPCASH_WEBHOOK_KEY)" }

railway variable set @vars

Write-Host "Railway variables set. API URL: $api"
Write-Host "GitHub secrets: RAILWAY_TOKEN (project token), RAILWAY_SERVICE_ID=0fd94dee-3cf3-4f78-b7ed-42471e1ea1ca, PUBLIC_API_URL=$api"
if (-not $env:SKIPCASH_CLIENT_ID) {
  Write-Host "SkipCash sandbox vars not set - add SKIPCASH_CLIENT_ID, SKIPCASH_KEY_ID, SKIPCASH_KEY_SECRET, SKIPCASH_WEBHOOK_KEY when ready."
}
