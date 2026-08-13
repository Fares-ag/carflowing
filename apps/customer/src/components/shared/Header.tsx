import { Link, useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { CarflowLogo } from '@carflow/shared'
import { ChevronDown, Heart, Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import './Header.css'

const CAR_CATEGORIES = [
  { label: 'All cars', to: '/browse' },
  { label: 'Sedan', to: '/browse?category=Sedan' },
  { label: 'SUV', to: '/browse?category=SUV' },
  { label: 'Electric', to: '/browse?category=Electric' },
]

const SAVED_PATH = '/settings?section=saved'
const SAVED_LOGIN_REDIRECT = `/login?redirect=${encodeURIComponent(SAVED_PATH)}`

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isCarsOpen, setIsCarsOpen] = useState(false)
  const carsRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { session } = useAuth()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (carsRef.current && !carsRef.current.contains(event.target as Node)) {
        setIsCarsOpen(false)
      }
    }
    if (isCarsOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [isCarsOpen])

  const closeMenu = () => setIsMenuOpen(false)

  const handleSavedClick = () => {
    if (session) {
      navigate(SAVED_PATH)
      return
    }
    navigate(SAVED_LOGIN_REDIRECT)
  }

  return (
    <>
      <header className="header">
        <div className="header-container">
          <Link to="/" className="logo">
            <img src={CarflowLogo} alt="Carflow" />
          </Link>

          <nav className="navigation" aria-label="Primary">
            <div className="nav-dropdown" ref={carsRef}>
              <button
                type="button"
                className={`nav-link nav-link--button ${isCarsOpen ? 'open' : ''}`}
                aria-expanded={isCarsOpen}
                aria-haspopup="true"
                onClick={() => setIsCarsOpen((open) => !open)}
              >
                Cars
                <ChevronDown size={14} />
              </button>
              {isCarsOpen && (
                <div className="nav-dropdown__menu" role="menu">
                  {CAR_CATEGORIES.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="nav-dropdown__item"
                      role="menuitem"
                      onClick={() => setIsCarsOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link to="/browse" className="nav-link">
              Browse Cars
            </Link>
            <Link to="/how-it-works" className="nav-link">
              How it works
            </Link>
            <Link to="/contact" className="nav-link">
              Contact
            </Link>
            <Link to="/faqs" className="nav-link">
              FAQ&apos;s
            </Link>
            {session && (
              <Link to="/my-booking" className="nav-link">
                My booking
              </Link>
            )}
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="header-saved"
              aria-label={session ? 'Saved cars' : 'Sign in to view saved cars'}
              title={session ? 'Saved cars' : 'Sign in to save cars'}
              onClick={handleSavedClick}
            >
              <Heart size={18} />
            </button>
            {session ? (
              <Link to="/settings" className="header-signin-btn">
                Account
              </Link>
            ) : (
              <Link to="/login" className="header-signin-btn">
                Sign In
              </Link>
            )}
            <button className="menu-button" type="button" aria-label="Open menu" onClick={() => setIsMenuOpen(true)}>
              <Menu size={18} />
            </button>
          </div>
        </div>
      </header>

      {isMenuOpen && (
        <div className="header-menu">
          <div className="header-menu__backdrop" onClick={closeMenu} />
          <div className="header-menu__panel">
            <button className="header-menu__close" type="button" onClick={closeMenu}>
              Close
            </button>
            <Link to="/browse" className="header-menu__link" onClick={closeMenu}>
              Browse Cars
            </Link>
            {CAR_CATEGORIES.filter((c) => c.label !== 'All cars').map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="header-menu__link header-menu__link--sub"
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            ))}
            <Link to="/how-it-works" className="header-menu__link" onClick={closeMenu}>
              How it works
            </Link>
            <Link to="/contact" className="header-menu__link" onClick={closeMenu}>
              Contact
            </Link>
            <Link to="/faqs" className="header-menu__link" onClick={closeMenu}>
              FAQ&apos;s
            </Link>
            {session ? (
              <>
                <Link to="/my-booking" className="header-menu__link" onClick={closeMenu}>
                  My booking
                </Link>
                <Link to={SAVED_PATH} className="header-menu__link" onClick={closeMenu}>
                  Saved cars
                </Link>
                <Link to="/settings" className="header-menu__cta" onClick={closeMenu}>
                  Account
                </Link>
              </>
            ) : (
              <Link to="/login" className="header-menu__cta" onClick={closeMenu}>
                Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  )
}
