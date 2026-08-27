import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'

/** A crash handed to telemetry. `componentStack` is React's own stack, not `error.stack`. */
export interface AppErrorReport {
  error: Error
  componentStack?: string
  /** Which boundary caught it — e.g. `app-root`, `checkout`. */
  boundary: string
  /** Page the crash happened on, for grouping white-screen deploys by route. */
  url?: string
  timestamp: string
}

export type AppErrorReporter = (report: AppErrorReport) => void

/**
 * Minimal shape of the Sentry browser SDK we use. Typed structurally so this
 * package never has to depend on `@sentry/react`.
 */
interface SentryLike {
  captureException?: (
    error: unknown,
    hint?: { contexts?: Record<string, unknown>; tags?: Record<string, unknown> }
  ) => void
}

let appErrorReporter: AppErrorReporter | null = null

/**
 * Register the process-wide crash sink. Call once at app bootstrap (main.tsx)
 * with whatever telemetry the app actually has:
 *
 *   import * as Sentry from '@sentry/react'
 *   setAppErrorReporter((r) => Sentry.captureException(r.error, { contexts: { react: r } }))
 *
 * Pass `null` to unregister (tests). Reporting never throws: a broken reporter
 * must not turn a recoverable render error into an unrecoverable one.
 */
export function setAppErrorReporter(reporter: AppErrorReporter | null): void {
  appErrorReporter = reporter
}

/**
 * Vite injects `VITE_SENTRY_DSN` into `import.meta.env` at build time (same
 * idiom as `API_BASE` in apiClient.ts). The `process.env` fallback only matters
 * for Node runs — SSR and the vitest suite — where each module gets its own
 * `import.meta`.
 */
function sentryDsn(): string | undefined {
  const fromVite =
    typeof import.meta !== 'undefined'
      ? ((import.meta as any).env?.VITE_SENTRY_DSN as string | undefined)
      : undefined
  const fromNode = typeof process !== 'undefined' ? process.env?.VITE_SENTRY_DSN : undefined
  return fromVite || fromNode
}

/**
 * Sentry is optional: `@sentry/react` is not a dependency of this package. When
 * an app initialises the SDK it exposes `window.Sentry`, which we use only when
 * a DSN is configured, so builds without telemetry stay silent.
 */
function windowSentry(): SentryLike | null {
  if (typeof window === 'undefined') return null
  const sentry = (window as unknown as { Sentry?: SentryLike }).Sentry
  return sentry && typeof sentry.captureException === 'function' ? sentry : null
}

/**
 * Fan a crash out to every sink that is wired up. Exported so non-React code
 * (route loaders, `window.onerror` handlers) can report through the same path.
 */
export function captureAppError(report: AppErrorReport): void {
  // Always keep the console breadcrumb — it is the only signal in local dev.
  console.error(`[${report.boundary}] error caught by boundary:`, report.error, report.componentStack)

  if (appErrorReporter) {
    try {
      appErrorReporter(report)
    } catch (reporterError) {
      console.error('Error reporter threw:', reporterError)
    }
  }

  if (!sentryDsn()) return
  const sentry = windowSentry()
  if (!sentry?.captureException) return
  try {
    sentry.captureException(report.error, {
      contexts: {
        react: { componentStack: report.componentStack },
        boundary: { name: report.boundary, url: report.url, timestamp: report.timestamp },
      },
      tags: { boundary: report.boundary },
    })
  } catch (sentryError) {
    console.error('Sentry captureException threw:', sentryError)
  }
}

interface Props {
  children: ReactNode
  fallback?: ReactNode
  /** Names the boundary in telemetry so a white screen points at a surface. */
  name?: string
  /** Per-boundary hook, called in addition to the app-wide reporter. */
  onError?: (report: AppErrorReport) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const report: AppErrorReport = {
      error,
      componentStack: errorInfo.componentStack ?? undefined,
      boundary: this.props.name ?? 'unnamed',
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      timestamp: new Date().toISOString(),
    }
    captureAppError(report)
    if (this.props.onError) {
      try {
        this.props.onError(report)
      } catch (hookError) {
        console.error('ErrorBoundary onError hook threw:', hookError)
      }
    }
  }

  private reset = () => {
    this.setState({ hasError: false, error: null })
  }

  /** Last resort when re-rendering the same tree throws again. */
  private reload = () => {
    if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          role="alert"
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: '#dc2626',
          }}
        >
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message || 'An unexpected error occurred'}</p>
          <div
            style={{
              marginTop: '1rem',
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={this.reset}
              style={{
                padding: '0.5rem 1rem',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.reload}
              style={{
                padding: '0.5rem 1rem',
                background: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
