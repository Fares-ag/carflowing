import type { Notification } from '@carflow/shared'
import { formatDate } from '@carflow/shared'
import { ArrowLeft, Bell, CheckCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/customerService'
import './NotificationsPage.css'

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(date)
}

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listNotifications({ pageSize: 50 })
      setItems(data.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const unreadCount = items.filter((n) => !n.read).length

  const handleRead = async (id: string) => {
    try {
      await markNotificationRead(id)
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    } catch {
      // ignore — list still shows item
    }
  }

  const handleReadAll = async () => {
    try {
      await markAllNotificationsRead()
      setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch {
      // ignore
    }
  }

  return (
    <div className="customer-notifications-page">
      <Header />
      <main className="customer-notifications-main">
        <div className="customer-notifications-header">
          <Link to="/my-booking" className="customer-notifications-back">
            <ArrowLeft size={14} />
            My booking
          </Link>
          <div className="customer-notifications-title-row">
            <div>
              <h1>Notifications</h1>
              <p>Payment reminders, booking updates, and account alerts</p>
            </div>
            {unreadCount > 0 ? (
              <button type="button" className="customer-notifications-read-all" onClick={handleReadAll}>
                <CheckCheck size={16} />
                Mark all read
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="customer-notifications-state">Loading…</div>
        ) : error ? (
          <div className="customer-notifications-state customer-notifications-state--error">{error}</div>
        ) : items.length === 0 ? (
          <div className="customer-notifications-empty">
            <Bell size={32} />
            <p>No notifications yet.</p>
          </div>
        ) : (
          <ul className="customer-notifications-list">
            {items.map((notification) => (
              <li
                key={notification.id}
                className={`customer-notifications-item ${notification.read ? '' : 'customer-notifications-item--unread'}`}
              >
                <div className="customer-notifications-item-body">
                  <strong>{notification.title}</strong>
                  <p>{notification.message}</p>
                  <time dateTime={notification.createdAt}>{formatTimeAgo(notification.createdAt)}</time>
                </div>
                {!notification.read ? (
                  <button
                    type="button"
                    className="customer-notifications-mark-read"
                    onClick={() => handleRead(notification.id)}
                  >
                    Mark read
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </div>
  )
}
