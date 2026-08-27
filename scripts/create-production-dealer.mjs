#!/usr/bin/env node
/**
 * Create (or verify) a production dealer via the admin API.
 *
 * Every credential comes from the environment — there is no default password and
 * no on-disk credential file. An earlier revision defaulted the dealer password to
 * the seed password published in this public repo, created the account with it, and
 * printed it to stdout (and therefore into CI logs and shell history).
 *
 * Required:
 *   ADMIN_EMAIL, ADMIN_PASSWORD    admin login used to call the API
 *   DEALER_EMAIL, DEALER_PASSWORD  dealer account to create
 * Optional:
 *   DEALER_NAME (default "Prime Auto Group"), PUBLIC_API_URL
 *
 * Usage (PowerShell):
 *   $env:ADMIN_EMAIL = "ops@carflow.qa"; $env:ADMIN_PASSWORD = "..."
 *   $env:DEALER_EMAIL = "dealer@carflow.qa"; $env:DEALER_PASSWORD = "..."
 *   node scripts/create-production-dealer.mjs
 */
const API =
  process.env.PUBLIC_API_URL?.replace(/\/$/, '') ||
  'https://carflow-api-production-9a43.up.railway.app'

/** Every secret is read from the environment; nothing is defaulted or printed. */
function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`${name} is required — export it before running this script.`)
    console.error('Required: ADMIN_EMAIL, ADMIN_PASSWORD, DEALER_EMAIL, DEALER_PASSWORD')
    process.exit(1)
  }
  return value
}

const dealerEmail = requiredEnv('DEALER_EMAIL').toLowerCase()
const dealerName = (process.env.DEALER_NAME || 'Prime Auto Group').trim()
const dealerPassword = requiredEnv('DEALER_PASSWORD')

function cookieHeaderFromResponse(res) {
  const raw = res.headers.getSetCookie?.() ?? []
  if (raw.length) return raw.map((c) => c.split(';')[0]).join('; ')
  const single = res.headers.get('set-cookie')
  return single ? single.split(/,(?=[^;]+=)/).map((c) => c.split(';')[0].trim()).join('; ') : ''
}

async function jsonOrText(res) {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

async function loginAdmin(email, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, expectedRole: 'admin' }),
  })
  const body = await jsonOrText(res)
  if (!res.ok) {
    throw new Error(`Admin login failed (${res.status}): ${body.error || JSON.stringify(body)}`)
  }
  if (body.requires2fa) {
    throw new Error('Admin account requires 2FA — disable 2FA or complete login manually first')
  }
  return cookieHeaderFromResponse(res)
}

async function createDealer(cookies) {
  const res = await fetch(`${API}/api/admin/dealers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
    },
    body: JSON.stringify({
      email: dealerEmail,
      name: dealerName,
      contactEmail: dealerEmail,
      password: dealerPassword,
    }),
  })
  const body = await jsonOrText(res)
  return { status: res.status, body }
}

async function verifyDealerLogin() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: dealerEmail,
      password: dealerPassword,
      expectedRole: 'dealer',
    }),
  })
  const body = await jsonOrText(res)
  return { ok: res.ok, status: res.status, body }
}

async function main() {
  const adminEmail = requiredEnv('ADMIN_EMAIL')
  const adminPassword = requiredEnv('ADMIN_PASSWORD')

  console.log(`API: ${API}`)
  console.log(`Creating dealer: ${dealerEmail}`)

  const cookies = await loginAdmin(adminEmail, adminPassword)
  const created = await createDealer(cookies)

  if (created.status === 201 || created.status === 200) {
    console.log(`Dealer created: ${dealerEmail}`)
  } else if (created.status === 409) {
    console.log(`Dealer already exists (${created.body.error || 'conflict'})`)
  } else {
    throw new Error(`Create dealer failed (${created.status}): ${JSON.stringify(created.body)}`)
  }

  const verify = await verifyDealerLogin()
  if (!verify.ok) {
    throw new Error(
      `Dealer login check failed (${verify.status}): ${verify.body.error || JSON.stringify(verify.body)}`
    )
  }

  console.log('Dealer login verified.')
  console.log('')
  console.log('Dealer portal: https://carflow-dealer.vercel.app')
  console.log(`Email:    ${dealerEmail}`)
  console.log('Password: (not printed — it is the DEALER_PASSWORD you exported)')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
