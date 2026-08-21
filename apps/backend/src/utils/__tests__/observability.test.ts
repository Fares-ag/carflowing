import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const mockCaptureException = vi.fn()
const mockCaptureMessage = vi.fn()
const mockSetupExpressErrorHandler = vi.fn()

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  setupExpressErrorHandler: (...args: unknown[]) => mockSetupExpressErrorHandler(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}))

describe('Observability', () => {
  let app: Express

  beforeAll(async () => {
    process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0'
    const { initObservability } = await import('../observability.js')
    await initObservability('test')
    const { createApp } = await import('../../app.js')
    app = createApp()
  })

  afterEach(() => {
    mockCaptureException.mockClear()
    mockCaptureMessage.mockClear()
    mockSetupExpressErrorHandler.mockClear()
  })

  it('OBS-01: installs Sentry express error handler after routes', () => {
    expect(mockSetupExpressErrorHandler).toHaveBeenCalled()
  })

  it('OBS-02: captures thrown route errors in Sentry', async () => {
    const res = await request(app).get('/__test__/throw')
    expect(res.status).toBe(500)
    expect(mockCaptureException).toHaveBeenCalled()
    const captured = mockCaptureException.mock.calls.some(([err]) =>
      err instanceof Error ? err.message.includes('observability test error') : false
    )
    expect(captured).toBe(true)
  })
})
