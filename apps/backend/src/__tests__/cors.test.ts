import { afterEach, describe, expect, it } from 'vitest'
import { resolveCorsOrigins } from '../app.js'

describe('resolveCorsOrigins', () => {
  afterEach(() => {
    delete process.env.CORS_ORIGINS
    delete process.env.CUSTOMER_APP_URL
    delete process.env.DEALER_APP_URL
    delete process.env.ADMIN_APP_URL
  })

  it('merges app URLs into explicit CORS_ORIGINS without duplicates', () => {
    process.env.CORS_ORIGINS = 'https://www.carflow.qa,https://carflow-admin-pied.vercel.app'
    process.env.CUSTOMER_APP_URL = 'https://www.carflow.qa'
    process.env.DEALER_APP_URL = 'https://carflow-dealer.vercel.app'
    process.env.ADMIN_APP_URL = 'https://carflow-admin-pied.vercel.app'

    expect(resolveCorsOrigins()).toEqual([
      'https://www.carflow.qa',
      'https://carflow-admin-pied.vercel.app',
      'https://carflow-dealer.vercel.app',
    ])
  })
})
