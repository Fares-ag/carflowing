import { ArrowLeft, Home } from 'lucide-react'
import { memo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Header.css'

function goBackSafely(navigate: ReturnType<typeof useNavigate>) {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  if (typeof idx === 'number' && idx > 0) {
    navigate(-1)
    return
  }
  navigate('/dashboard')
}

export const Header = memo(function Header() {
  const navigate = useNavigate()
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-nav">
          <button
            className="back-button"
            type="button"
            aria-label="Go back"
            onClick={() => goBackSafely(navigate)}
          >
            <ArrowLeft size={14} />
          </button>
          <Link to="/dashboard" className="home-link">
            <Home size={14} />
            <span>Home</span>
          </Link>
        </div>
      </div>
    </header>
  )
})
