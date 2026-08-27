import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'
import './RouteErrorBoundary.css'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Recovery UI for route-level crashes, and above all for lazy chunk load
 * failures.
 *
 * Every page in this app is a `React.lazy` chunk. After a deploy the old
 * index.html keeps pointing at hashed chunk files that no longer exist, so the
 * dynamic import rejects and React unmounts the tree — the customer gets a
 * white screen and no way out, and we never hear about it. A hard reload fetches
 * the new index.html and fixes it, so the fallback always offers one.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // No frontend telemetry sink exists yet; the console is all we have.
    console.error('Route error boundary caught:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleGoHome = () => {
    // Full navigation rather than a router push: the loaded bundle is the thing
    // that failed, so re-entering the app from scratch is the point.
    window.location.assign('/')
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const isChunkError = isChunkLoadError(this.state.error)

    return (
      <div className="route-error" role="alert">
        <div className="route-error__card">
          <h1>{isChunkError ? 'This page needs a refresh' : 'Something went wrong'}</h1>
          <p>
            {isChunkError
              ? 'We just released an update, so part of this page could not be loaded. Reloading picks up the new version.'
              : 'We could not open this page. Reloading usually fixes it — if it does not, head back to the homepage.'}
          </p>
          <div className="route-error__actions">
            <button type="button" className="route-error__btn" onClick={this.handleReload}>
              Reload page
            </button>
            <button
              type="button"
              className="route-error__btn route-error__btn--ghost"
              onClick={this.handleGoHome}
            >
              Go to homepage
            </button>
          </div>
          {this.state.error?.message ? (
            <p className="route-error__detail">{this.state.error.message}</p>
          ) : null}
        </div>
      </div>
    )
  }
}

/** Vite/browsers report a failed dynamic import with these shapes. */
function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(
    `${error.name} ${error.message}`
  )
}
