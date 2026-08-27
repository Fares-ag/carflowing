// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ErrorBoundary,
  captureAppError,
  setAppErrorReporter,
  type AppErrorReport,
} from '../components/ErrorBoundary.js'

const baseReport = (over: Partial<AppErrorReport> = {}): AppErrorReport => ({
  error: new Error('white screen'),
  componentStack: '\n    at CarDetailPage',
  boundary: 'app-root',
  url: 'http://localhost/cars/1',
  timestamp: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('frontend error telemetry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    setAppErrorReporter(null)
    delete (window as unknown as { Sentry?: unknown }).Sentry
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('forwards the crash to the registered reporter', () => {
    const reporter = vi.fn()
    setAppErrorReporter(reporter)

    const report = baseReport()
    captureAppError(report)

    expect(reporter).toHaveBeenCalledTimes(1)
    expect(reporter.mock.calls[0][0]).toMatchObject({
      boundary: 'app-root',
      componentStack: '\n    at CarDetailPage',
      url: 'http://localhost/cars/1',
    })
    expect(reporter.mock.calls[0][0].error).toBe(report.error)
  })

  it('still logs to the console when no reporter is registered', () => {
    captureAppError(baseReport())
    expect(console.error).toHaveBeenCalled()
  })

  it('swallows a throwing reporter so the boundary can still render', () => {
    setAppErrorReporter(() => {
      throw new Error('telemetry is down')
    })
    expect(() => captureAppError(baseReport())).not.toThrow()
  })

  it('does not touch Sentry when no DSN is configured', () => {
    const captureException = vi.fn()
    ;(window as unknown as { Sentry?: unknown }).Sentry = { captureException }

    captureAppError(baseReport())

    expect(captureException).not.toHaveBeenCalled()
  })

  it('reports to window.Sentry once a DSN is configured', () => {
    const captureException = vi.fn()
    ;(window as unknown as { Sentry?: unknown }).Sentry = { captureException }
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@sentry.example/1')

    const report = baseReport()
    captureAppError(report)

    expect(captureException).toHaveBeenCalledTimes(1)
    const [error, hint] = captureException.mock.calls[0]
    expect(error).toBe(report.error)
    expect(hint.tags).toEqual({ boundary: 'app-root' })
    expect(hint.contexts.react).toEqual({ componentStack: report.componentStack })
  })

  it('survives a Sentry SDK that throws', () => {
    const throwingSentry = {
      captureException: () => {
        throw new Error('sdk exploded')
      },
    }
    ;(window as unknown as { Sentry?: unknown }).Sentry = throwingSentry
    vi.stubEnv('VITE_SENTRY_DSN', 'https://public@sentry.example/1')

    expect(() => captureAppError(baseReport())).not.toThrow()
  })
})

const Boom = () => {
  throw new Error('render exploded')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error itself; keep the suite output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    setAppErrorReporter(null)
    vi.restoreAllMocks()
  })

  it('reports the crash with the boundary name and the component stack', () => {
    const reporter = vi.fn()
    setAppErrorReporter(reporter)
    const onError = vi.fn()

    render(
      createElement(
        ErrorBoundary,
        { name: 'checkout', onError },
        createElement(Boom)
      )
    )

    expect(reporter).toHaveBeenCalledTimes(1)
    const report = reporter.mock.calls[0][0] as AppErrorReport
    expect(report.boundary).toBe('checkout')
    expect(report.error.message).toBe('render exploded')
    expect(report.componentStack).toContain('Boom')
    expect(report.url).toBe(window.location.href)
    expect(onError).toHaveBeenCalledWith(report)
  })

  it('offers a recovery action instead of a dead end', () => {
    render(createElement(ErrorBoundary, null, createElement(Boom)))

    expect(screen.getByRole('alert').textContent).toContain('Something went wrong')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy()
  })

  it('renders a custom fallback when one is given', () => {
    render(
      createElement(
        ErrorBoundary,
        { fallback: createElement('p', null, 'Checkout is unavailable') },
        createElement(Boom)
      )
    )

    expect(screen.getByText('Checkout is unavailable')).toBeTruthy()
  })
})
