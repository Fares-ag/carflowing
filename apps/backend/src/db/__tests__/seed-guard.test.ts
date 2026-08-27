import { afterEach, describe, expect, it } from 'vitest'
import { seedDemoData } from '../seed.js'
import { sqlClient } from '../index.js'
import { resetDb } from '../../test/helpers.js'

const originalNodeEnv = process.env.NODE_ENV
const originalDatabaseUrl = process.env.DATABASE_URL
const originalOverride = process.env.ALLOW_DESTRUCTIVE_SEED

/**
 * The demo seed plants admin@/dealer@/customer@carflow.dev with a password that
 * is published in a public repo, and a go-live script used to run it against the
 * production DATABASE_URL.
 */
describe('seedDemoData production guard', () => {
  afterEach(async () => {
    process.env.NODE_ENV = originalNodeEnv
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDatabaseUrl
    if (originalOverride === undefined) delete process.env.ALLOW_DESTRUCTIVE_SEED
    else process.env.ALLOW_DESTRUCTIVE_SEED = originalOverride
    await resetDb()
    // resetDb() cascades from profiles/dealers, which never reaches the dealer
    // plan catalogue seeded above.
    await sqlClient.unsafe('TRUNCATE TABLE dealer_plans RESTART IDENTITY CASCADE')
  })

  it('ADM-SEED-01: refuses to run when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production'
    await expect(seedDemoData()).rejects.toThrow(/NODE_ENV=production/)
  })

  it('ADM-SEED-02: production has no override', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOW_DESTRUCTIVE_SEED = 'true'
    await expect(seedDemoData()).rejects.toThrow(/no override for production/)
  })

  it('ADM-SEED-03: refuses a remote DATABASE_URL without an explicit override', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@ep-live.eu-central-1.aws.neon.tech/carflow'
    await expect(seedDemoData()).rejects.toThrow(
      /host "ep-live\.eu-central-1\.aws\.neon\.tech" is not localhost/
    )
  })

  it('ADM-SEED-04: still seeds a local database', async () => {
    const result = await seedDemoData()
    expect(result.dealerId).toBeTruthy()
  })
})
