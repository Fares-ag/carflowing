import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { CarflowLogo } from '@carflow/shared'
import { Bell, Menu, Search, User } from 'lucide-react'
import { InfoModal } from './InfoModal'
import './Header.css'

export function Header() {
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()
  const handleNotifications = () => {
    setInfoModal({
      title: 'Notifications',
      message: 'Notifications are available in your dashboard.',
    })
  }

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = searchQuery.trim()
    navigate(query ? `/browse?search=${encodeURIComponent(query)}` : '/browse')
  }
  return (
    <>
      <header className="header">
        <div className="header-container">
          <Link to="/" className="logo">
            <img src={CarflowLogo} alt="Carflow" />
          </Link>
          
          <nav className="navigation">
            <Link to="/browse" className="nav-link">Browse Cars</Link>
            <Link to="/how-it-works" className="nav-link">How it works</Link>
            <Link to="/contact" className="nav-link">Contact</Link>
            <Link to="/faqs" className="nav-link">FAQ's</Link>
          </nav>

          <div className="header-actions">
            <form className="search-container" onSubmit={handleSearchSubmit}>
              <input
                type="text"
                placeholder="Search..."
                className="search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <button type="submit" className="search-submit" aria-label="Search">
                <Search className="search-icon" size={16} />
              </button>
            </form>
            <button className="icon-button" type="button" onClick={handleNotifications}>
              <Bell size={20} />
              <span className="badge">1</span>
            </button>
            <Link to="/dashboard" className="profile-button">
              <div className="profile-avatar">
                <User size={16} />
              </div>
            </Link>
            <button className="menu-button" type="button" aria-label="Open menu" onClick={() => setIsMenuOpen(true)}>
              <Menu size={18} />
            </button>
          </div>
        </div>
      </header>

      {isMenuOpen && (
        <div className="header-menu">
          <div className="header-menu__backdrop" onClick={() => setIsMenuOpen(false)} />
          <div className="header-menu__panel">
            <button className="header-menu__close" type="button" onClick={() => setIsMenuOpen(false)}>
              Close
            </button>
            <Link to="/browse" className="header-menu__link" onClick={() => setIsMenuOpen(false)}>
              Browse Cars
            </Link>
            <Link to="/how-it-works" className="header-menu__link" onClick={() => setIsMenuOpen(false)}>
              How it works
            </Link>
            <Link to="/contact" className="header-menu__link" onClick={() => setIsMenuOpen(false)}>
              Contact
            </Link>
            <Link to="/faqs" className="header-menu__link" onClick={() => setIsMenuOpen(false)}>
              FAQ's
            </Link>
            <Link to="/dashboard" className="header-menu__cta" onClick={() => setIsMenuOpen(false)}>
              Dashboard
            </Link>
          </div>
        </div>
      )}

      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
    </>
  )
}

