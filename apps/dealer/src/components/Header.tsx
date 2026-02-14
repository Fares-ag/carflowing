import { memo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Home } from 'lucide-react'
import './Header.css'

export const Header = memo(function Header() {
  const navigate = useNavigate()
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-nav">
          <button className="back-button" type="button" onClick={() => navigate(-1)}>
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
