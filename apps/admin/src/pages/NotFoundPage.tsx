import { Link } from 'react-router-dom'
import './NotFoundPage.css'

export function NotFoundPage() {
  return (
    <div className="adminNotFound">
      <div className="adminNotFoundCard">
        <h1 className="adminNotFoundTitle">Page not found</h1>
        <p className="adminNotFoundSubtitle">This link may be outdated or mistyped.</p>
        <Link to="/dashboard" className="adminNotFoundCta">
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
