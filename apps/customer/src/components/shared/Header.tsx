import type { Invoice } from '@carflow/shared'
import { CarflowLogo } from '@carflow/shared'

import { Bell, ChevronDown, Heart, Mail, Menu } from 'lucide-react'

import { useState, useRef, useEffect } from 'react'

import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../../contexts/AuthContext'

import { getUnreadMessageCount, getUnreadNotificationCount, listInvoices } from '../../services/customerService'

import { getLocale, setLocale, subscribeLocale, t, type Locale } from '../../i18n'

import { OverdueInvoiceBanner } from './OverdueInvoiceBanner'

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

  const [unreadCount, setUnreadCount] = useState(0)

  const [unreadMessages, setUnreadMessages] = useState(0)

  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([])

  const [locale, setLocaleState] = useState<Locale>(getLocale())



  useEffect(() => subscribeLocale(() => setLocaleState(getLocale())), [])



  useEffect(() => {

    if (!session) {

      setUnreadCount(0)

      setUnreadMessages(0)

      setOverdueInvoices([])

      return

    }

    let active = true

    Promise.all([getUnreadNotificationCount(), getUnreadMessageCount(), listInvoices()])

      .then(([notifCount, msgCount, invoices]) => {

        if (active) {

          setUnreadCount(notifCount)

          setUnreadMessages(msgCount)

          setOverdueInvoices(invoices.filter((invoice) => invoice.status === 'overdue'))

        }

      })

      .catch(() => {

        if (active) {

          setUnreadCount(0)

          setUnreadMessages(0)

          setOverdueInvoices([])

        }

      })

    return () => {

      active = false

    }

  }, [session?.userId])



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



  const toggleLocale = () => {

    const next: Locale = locale === 'en' ? 'ar' : 'en'

    setLocale(next)

    setLocaleState(next)

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

              {t('nav.browse')}

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

                {t('nav.myBooking')}

              </Link>

            )}

          </nav>



          <div className="header-actions">

            <button

              type="button"

              className="header-locale"

              aria-label={t('nav.language')}

              title={t('nav.language')}

              onClick={toggleLocale}

            >

              {locale === 'en' ? 'ع' : 'EN'}

            </button>

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

              <>

                <Link

                  to="/messages"

                  className="header-messages"

                  aria-label={`${t('nav.messages')}${unreadMessages ? `, ${unreadMessages} unread` : ''}`}

                >

                  <Mail size={18} />

                  {unreadMessages > 0 ? (

                    <span className="header-notifications-badge">

                      {unreadMessages > 9 ? '9+' : unreadMessages}

                    </span>

                  ) : null}

                </Link>

                <Link

                  to="/notifications"

                  className="header-notifications"

                  aria-label={`${t('nav.notifications')}${unreadCount ? `, ${unreadCount} unread` : ''}`}

                >

                  <Bell size={18} />

                  {unreadCount > 0 ? (

                    <span className="header-notifications-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>

                  ) : null}

                </Link>

              </>

            ) : null}

            {session ? (

              <Link to="/settings" className="header-signin-btn header-account-link">

                {t('nav.account')}

                {overdueInvoices.length > 0 ? (

                  <span className="header-notifications-badge" aria-label={`${overdueInvoices.length} overdue invoices`}>

                    {overdueInvoices.length > 9 ? '9+' : overdueInvoices.length}

                  </span>

                ) : null}

              </Link>

            ) : (

              <Link to="/login" className="header-signin-btn">

                {t('nav.signIn')}

              </Link>

            )}

            <button className="menu-button" type="button" aria-label="Open menu" onClick={() => setIsMenuOpen(true)}>

              <Menu size={18} />

            </button>

          </div>

        </div>

      </header>

      <OverdueInvoiceBanner invoices={overdueInvoices} />



      {isMenuOpen && (

        <div className="header-menu">

          <div className="header-menu__backdrop" onClick={closeMenu} />

          <div className="header-menu__panel">

            <button className="header-menu__close" type="button" onClick={closeMenu}>

              Close

            </button>

            <Link to="/browse" className="header-menu__link" onClick={closeMenu}>

              {t('nav.browse')}

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

                  {t('nav.myBooking')}

                </Link>

                <Link to={SAVED_PATH} className="header-menu__link" onClick={closeMenu}>

                  Saved cars

                </Link>

                <Link to="/messages" className="header-menu__link" onClick={closeMenu}>

                  {t('nav.messages')}

                </Link>

                <Link to="/notifications" className="header-menu__link" onClick={closeMenu}>

                  {t('nav.notifications')}

                </Link>

                <Link to="/settings" className="header-menu__cta" onClick={closeMenu}>

                  {t('nav.account')}

                  {overdueInvoices.length > 0 ? ` (${overdueInvoices.length} overdue)` : ''}

                </Link>

              </>

            ) : (

              <Link to="/login" className="header-menu__cta" onClick={closeMenu}>

                {t('nav.signIn')}

              </Link>

            )}

          </div>

        </div>

      )}

    </>

  )

}


