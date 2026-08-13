import { Link } from 'react-router-dom'
import './NotFoundPage.css'

export function NotFoundPage() {
  return (
    <div className="dealerNotFound">
      <div className="dealerNotFoundCard">
        <h1 className="dealerNotFoundTitle">Page not found</h1>
        <p className="dealerNotFoundSubtitle">
          This link may be outdated or mistyped.
        </p>
        <Link to="/dashboard" className="dealerNotFoundCta">
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
