import { Link } from 'react-router-dom'
import './ForbiddenPage.css'

export function ForbiddenPage() {
  return (
    <div className="adminForbidden">
      <div className="adminForbiddenCard">
        <h1 className="adminForbiddenTitle">You don&apos;t have access</h1>
        <p className="adminForbiddenSubtitle">
          Your account role cannot open this page. Use the sidebar or return to the dashboard.
        </p>
        <Link to="/dashboard" className="adminForbiddenCta">
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
