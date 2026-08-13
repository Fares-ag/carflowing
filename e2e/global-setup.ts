/**
 * Playwright global setup. The actual DB boot + seed happens inside
 * apps/backend/scripts/e2e-server.ts (started as a `webServer`), so this
 * just double-checks the seeded demo accounts are reachable before the
 * suite starts, giving a clearer failure than a random first-test timeout.
 */
async function main() {
  const res = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'customer@carflow.dev',
      password: 'password123',
      expectedRole: 'customer',
    }),
  })
  if (!res.ok) {
    throw new Error(
      `E2E global setup: seeded demo customer login failed (status ${res.status}). ` +
        'Check apps/backend/scripts/e2e-server.ts output.'
    )
  }
}

export default main
