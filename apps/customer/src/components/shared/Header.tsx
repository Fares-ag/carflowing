import { Link, useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CarflowLogo, formatDate } from '@carflow/shared'
import { Bell, Menu, Search, User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/customerService'
import { InfoModal } from './InfoModal'
import './Header.css'

export function Header() {
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useAuth()

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: getUnreadNotificationCount,
    enabled: !!session,
  })

  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => listNotifications({ pageSize: 15 }),
    enabled: !!session && isNotificationsOpen,
  })

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false)
      }
    }
    if (isNotificationsOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [isNotificationsOpen])

  const handleNotifications = () => {
    if (!session) {
      setInfoModal({
        title: 'Notifications',
        message: 'Sign in to view your notifications.',
      })
      return
    }
    setIsNotificationsOpen((open) => !open)
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead()
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    } catch {
      console.error('Failed to mark notifications as read')
    }
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
            <div className="header-notifications" ref={panelRef}>
              <button
                className="icon-button"
                type="button"
                onClick={handleNotifications}
                aria-label="Notifications"
                aria-expanded={isNotificationsOpen}
              >
                <Bell size={20} />
                {session && unreadCount > 0 && (
                  <span className="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </button>
              {isNotificationsOpen && session && (
                <div className="header-notifications-panel">
                  <div className="header-notifications-header">
                    <h3>Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="header-notifications-mark-all"
                        onClick={handleMarkAllRead}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="header-notifications-list">
                    {isLoading ? (
                      <p className="header-notifications-empty">Loading…</p>
                    ) : !notificationsData?.items.length ? (
                      <p className="header-notifications-empty">No notifications yet.</p>
                    ) : (
                      notificationsData.items.map((n) => (
                        <div
                          key={n.id}
                          className={`header-notification-item ${n.read ? 'read' : ''}`}
                          onClick={() => {
                            if (!n.read) {
                              markNotificationRead(n.id).then(() =>
                                queryClient.invalidateQueries({ queryKey: ['notifications'] })
                              )
                            }
                          }}
                        >
                          <div className="header-notification-title">{n.title}</div>
                          <div className="header-notification-message">{n.message}</div>
                          <div className="header-notification-date">{formatDate(n.createdAt)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <Link to={session ? '/settings' : '/login'} className="profile-button">
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
            <Link to="/contact" className="header-menu__link" onClick={() => setIsMenuOpen(false)}>
              Contact
            </Link>
            <Link to="/faqs" className="header-menu__link" onClick={() => setIsMenuOpen(false)}>
              FAQ's
            </Link>
            <Link
              to={session ? '/settings' : '/login'}
              className="header-menu__cta"
              onClick={() => setIsMenuOpen(false)}
            >
              {session ? 'Profile' : 'Sign in'}
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

