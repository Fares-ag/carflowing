import { ArrowLeft, Home } from 'lucide-react'
import { memo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Header.css'

interface HeaderProps {
  title?: string
  subtitle?: string
}

function goBackSafely(navigate: ReturnType<typeof useNavigate>) {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  if (typeof idx === 'number' && idx > 0) {
    navigate(-1)
    return
  }
  navigate('/dashboard')
}

export const Header = memo(function Header({ title, subtitle }: HeaderProps) {
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
        {(title || subtitle) && (
          <div className="header-title-block">
            {title ? <h1 className="header-title">{title}</h1> : null}
            {subtitle ? <p className="header-subtitle">{subtitle}</p> : null}
          </div>
        )}
      </div>
    </header>
  )
})
