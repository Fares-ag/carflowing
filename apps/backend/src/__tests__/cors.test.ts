import type { Express } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveCorsOrigins, createApp } from '../app.js'

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

describe('CORS preflight', () => {
  afterEach(() => {
    delete process.env.CORS_ORIGINS
    delete process.env.CUSTOMER_APP_URL
  })

  it('returns ACAO for OPTIONS /api/auth/signup from www.carflow.qa', async () => {
    process.env.CORS_ORIGINS = 'https://www.carflow.qa'
    process.env.CUSTOMER_APP_URL = 'https://www.carflow.qa'
    const app: Express = createApp()

    const res = await request(app)
      .options('/api/auth/signup')
      .set('Origin', 'https://www.carflow.qa')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')

    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('https://www.carflow.qa')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })
})
