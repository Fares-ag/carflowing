import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { markBootFailed, markBootStarting, resetBootStateForTests } from '../utils/bootState.js'

describe('boot readiness and fallback responses', () => {
  let app: Express

  beforeAll(() => {
    app = createApp()
  })

  afterEach(() => {
    resetBootStateForTests()
    vi.unstubAllEnvs()
  })

  it('BOOT-01: /health is 503 while migrations and the scheduler are still starting', async () => {
    markBootStarting()
    const res = await request(app).get('/health')
    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ status: 'starting', boot: 'starting' })
  })

  it('BOOT-02: /health is 503 after boot exhausts its retries', async () => {
    markBootFailed('relation "vehicles" does not exist')
    const res = await request(app).get('/health')
    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({ status: 'error', boot: 'failed' })
    // The failure reason may name internals; it must not reach the client.
    expect(JSON.stringify(res.body)).not.toContain('does not exist')
  })

  it('BOOT-03: /health/live stays 200 while booting (Dockerfile HEALTHCHECK)', async () => {
    markBootStarting()
    const res = await request(app).get('/health/live')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('BOOT-04: /health returns 200 once boot is complete', async () => {
    resetBootStateForTests()
    // Warm the lazily-opened Postgres connection first so this asserts the
    // boot gate, not a cold-connect race in the /health DB probe.
    await request(app).get('/health')
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.boot).toBeUndefined()
  })

  it('BOOT-05: unmatched /api routes return JSON 404, not the Express HTML page', async () => {
    const res = await request(app).get('/api/nope/definitely-not-a-route')
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('BOOT-06: unmatched non-API routes and non-GET methods return JSON 404 too', async () => {
    const res = await request(app).post('/definitely-not-a-route').send({ hello: 'world' })
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/application\/json/)
    expect(res.body).toEqual({ error: 'Not found' })
  })
})

describe('access logging', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('BOOT-07: logs one structured line per request with the request id', async () => {
    vi.stubEnv('ACCESS_LOG', 'true')
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const app = createApp()

    const res = await request(app).get('/health/live').set('x-request-id', 'boot-test-request-id')
    expect(res.status).toBe(200)

    const lines = info.mock.calls
      .map(([line]) => (typeof line === 'string' ? line : ''))
      .filter((line) => line.includes('"http.request"'))
    info.mockRestore()

    expect(lines).toHaveLength(1)
    const logged = JSON.parse(lines[0]) as Record<string, unknown>
    expect(logged).toMatchObject({
      level: 'info',
      event: 'http.request',
      requestId: 'boot-test-request-id',
      method: 'GET',
      path: '/health/live',
      status: 200,
      userId: null,
    })
    expect(typeof logged.durationMs).toBe('number')
  })

  it('BOOT-08: never logs query strings, which can carry tokens', async () => {
    vi.stubEnv('ACCESS_LOG', 'true')
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const app = createApp()

    await request(app).get('/health/live?token=super-secret-value')

    const lines = info.mock.calls.map(([line]) => (typeof line === 'string' ? line : ''))
    info.mockRestore()

    const accessLine = lines.find((line) => line.includes('"http.request"'))
    expect(accessLine).toBeDefined()
    expect(accessLine).not.toContain('super-secret-value')
    expect(JSON.parse(accessLine as string).path).toBe('/health/live')
  })
})
