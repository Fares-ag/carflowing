const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const scriptPath = path.join(__dirname, '..', 'create-production-dealer.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')

const CREDENTIAL_VARS = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'DEALER_EMAIL', 'DEALER_PASSWORD', 'DEALER_NAME']

/** Runs the script with only the credential vars the test sets — never the caller's. */
function run(overrides = {}) {
  const env = { ...process.env }
  for (const key of CREDENTIAL_VARS) delete env[key]
  Object.assign(env, overrides)
  const result = spawnSync(process.execPath, [scriptPath], { env, encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

describe('create-production-dealer', () => {
  it('exits non-zero when no credentials are in the environment', () => {
    const { status, output } = run()
    assert.equal(status, 1)
    assert.match(output, /DEALER_EMAIL is required/)
    assert.match(output, /ADMIN_EMAIL, ADMIN_PASSWORD, DEALER_EMAIL, DEALER_PASSWORD/)
  })

  it('exits non-zero when DEALER_PASSWORD is missing', () => {
    const { status, output } = run({
      ADMIN_EMAIL: 'ops@carflow.qa',
      ADMIN_PASSWORD: 'admin-pw-for-test',
      DEALER_EMAIL: 'dealer@carflow.qa',
    })
    assert.equal(status, 1)
    assert.match(output, /DEALER_PASSWORD is required/)
  })

  it('exits non-zero when ADMIN_PASSWORD is missing', () => {
    const { status, output } = run({
      ADMIN_EMAIL: 'ops@carflow.qa',
      DEALER_EMAIL: 'dealer@carflow.qa',
      DEALER_PASSWORD: 'dealer-pw-for-test',
    })
    assert.equal(status, 1)
    assert.match(output, /ADMIN_PASSWORD is required/)
  })

  it('never prints a password, even on failure', () => {
    const dealerPassword = 'dealer-pw-must-not-be-printed'
    const adminPassword = 'admin-pw-must-not-be-printed'
    // Port 1 is unbound, so the admin login fails and the script takes its error path.
    const { status, output } = run({
      PUBLIC_API_URL: 'http://127.0.0.1:1',
      ADMIN_EMAIL: 'ops@carflow.qa',
      ADMIN_PASSWORD: adminPassword,
      DEALER_EMAIL: 'dealer@carflow.qa',
      DEALER_PASSWORD: dealerPassword,
    })
    assert.notEqual(status, 0)
    assert.doesNotMatch(output, new RegExp(dealerPassword))
    assert.doesNotMatch(output, new RegExp(adminPassword))
  })

  it('has no default password and no on-disk credential fallback', () => {
    assert.doesNotMatch(source, /password123/)
    assert.doesNotMatch(source, /\.production-admin\.local/)
    assert.doesNotMatch(source, /readLocalCreds/)
    // The only place a password may reach stdout is a line that says it is NOT printed.
    assert.doesNotMatch(source, /console\.log\([^)]*\$\{(dealerPassword|adminPassword)\}/)
  })
})
