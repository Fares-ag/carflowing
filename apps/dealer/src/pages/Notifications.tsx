import type { Notification as ApiNotification } from '@carflow/shared'
import { formatDate } from '@carflow/shared'
import { AlertTriangle, CalendarCheck, CreditCard, Info } from 'lucide-react'
import { useState, useCallback, memo, useEffect } from 'react'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/dealerService'

import './Notifications.css'



function formatTimeAgo(dateStr: string): string {

  const date = new Date(dateStr)

  const now = new Date()

  const diffMs = now.getTime() - date.getTime()

  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'Just now'

  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)

  if (diffHr < 24) return `${diffHr}h ago`

  const diffDays = Math.floor(diffHr / 24)

  if (diffDays < 7) return `${diffDays}d ago`

  return formatDate(date)

}



interface NotificationRow {

  id: string

  type: 'booking' | 'payment' | 'maintenance' | 'warning' | 'info'

  title: string

  description: string

  time: string

  read: boolean

}



function mapNotificationItems(items: ApiNotification[]): NotificationRow[] {

  return items.map((notification) => ({

    id: notification.id,

    type: (notification.type === 'success' ? 'booking' : notification.type === 'warning' ? 'maintenance' : notification.type === 'error' ? 'warning' : notification.type === 'info' ? 'info' : 'payment') as NotificationRow['type'],

    title: notification.title,

    description: notification.message,

    time: formatTimeAgo(notification.createdAt),

    read: notification.read,

  }))

}



export const Notifications = memo(function Notifications() {

  const [notifications, setNotifications] = useState<NotificationRow[]>([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState<string | null>(null)



  useEffect(() => {

    let cancelled = false

    setLoading(true)

    setError(null)

    ;(async () => {

      try {

        const data = await listNotifications({ pageSize: 12 })

        if (!cancelled) setNotifications(mapNotificationItems(data.items))

      } catch (err) {

        if (!cancelled) {

          setError(err instanceof Error ? err.message : 'Failed to load notifications')

          setNotifications([])

        }

      } finally {

        if (!cancelled) setLoading(false)

      }

    })()

    return () => {

      cancelled = true

    }

  }, [])



  const handleMarkAllAsRead = useCallback(() => {

    markAllNotificationsRead()

      .then((updated) => {

        setNotifications(mapNotificationItems(updated))

      })

      .catch((err) => {

        setError(err instanceof Error ? err.message : 'Failed to mark all as read')

      })

  }, [])



  const handleMarkAsRead = useCallback((id: string) => {

    markNotificationRead(id)

      .then(() => {

        setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)))

      })

      .catch((err) => {

        setError(err instanceof Error ? err.message : 'Failed to update notification')

      })

  }, [])



  const getNotificationIcon = (type: NotificationRow['type']) => {

    switch (type) {

      case 'booking':

        return <CalendarCheck size={18} />

      case 'payment':

        return <CreditCard size={18} />

      case 'maintenance':

        return <AlertTriangle size={18} />

      default:

        return <Info size={18} />

    }

  }



  const unreadCount = notifications.filter(n => !n.read).length



  return (

    <div className="notifications-page">

      <Sidebar />

      <Header />

      

      <div className="notifications-content" role="main">

        <div className="page-header">

          <div className="page-title-section">

            <h1 className="page-title">Notifications</h1>

            <p className="page-subtitle">Stay updated with your business activities</p>

          </div>

          {!loading && !error && unreadCount > 0 && (

            <button 

              className="mark-all-read-btn"

              onClick={handleMarkAllAsRead}

            >

              Mark All as Read

            </button>

          )}

        </div>



        {loading && (

          <div className="notifications-loading" role="status">

            <div className="notifications-loading-spinner" aria-hidden />

            <span>Loading notifications...</span>

          </div>

        )}



        {error && !loading && (

          <div className="notifications-error" role="alert">

            {error}

          </div>

        )}



        <div className="notifications-card">

          <div className="notifications-list">

            {!loading && !error && notifications.length === 0 ? (

              <div className="empty-state">

                <p>No notifications yet.</p>

              </div>

            ) : null}

            {!loading && !error && notifications.length > 0

              ? notifications.map((notification) => (

                <div

                  key={notification.id}

                  className={`notification-item ${notification.read ? 'read' : ''}`}

                  onClick={() => handleMarkAsRead(notification.id)}

                >

                  <div className="notification-icon">

                    {getNotificationIcon(notification.type)}

                  </div>

                  <div className="notification-content">

                    <h4 className="notification-title">{notification.title}</h4>

                    <p className="notification-description">{notification.description}</p>

                    <p className="notification-time">{notification.time}</p>

                  </div>

                  {!notification.read && <div className="unread-dot"></div>}

                </div>

              ))

              : null}

          </div>

        </div>

      </div>

    </div>

  )

})

