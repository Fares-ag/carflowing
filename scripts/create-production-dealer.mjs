#!/usr/bin/env node
/**
 * Create (or verify) a production dealer via the admin API.
 * Reads admin credentials from .production-admin.local or env vars.
 *
 * Usage:
 *   node scripts/create-production-dealer.mjs
 *   DEALER_EMAIL=dealer@carflow.dev DEALER_PASSWORD=password123 node scripts/create-production-dealer.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const API =
  process.env.PUBLIC_API_URL?.replace(/\/$/, '') ||
  'https://carflow-api-production-9a43.up.railway.app'

const dealerEmail = (process.env.DEALER_EMAIL || 'dealer@carflow.dev').trim().toLowerCase()
const dealerName = (process.env.DEALER_NAME || 'Prime Auto Group').trim()
const dealerPassword = process.env.DEALER_PASSWORD || 'password123'

function readLocalCreds() {
  const file = path.join(root, '.production-admin.local')
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) out[m[1].trim()] = m[2].trim()
  }
  return out
}

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
  const local = readLocalCreds()
  const adminEmail = process.env.ADMIN_EMAIL || local.email
  const adminPassword = process.env.ADMIN_PASSWORD || local.password
  if (!adminEmail || !adminPassword) {
    console.error('Set ADMIN_EMAIL/ADMIN_PASSWORD or create .production-admin.local')
    process.exit(1)
  }

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
  console.log(`Password: ${dealerPassword}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
