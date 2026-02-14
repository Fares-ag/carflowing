import { useState, useCallback, memo, useEffect } from 'react'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../services/dealerService'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
import { AlertTriangle, CalendarCheck, CreditCard, Info } from 'lucide-react'
import './Notifications.css'

interface Notification {
  id: string
  type: 'booking' | 'payment' | 'maintenance' | 'warning' | 'info'
  title: string
  description: string
  time: string
  read: boolean
}

export const Notifications = memo(function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    listNotifications({ pageSize: 12 }).then((data) => {
      const mapped = data.items.map((notification, index) => ({
        id: notification.id,
        type: index % 2 === 0 ? 'booking' : 'payment',
        title: notification.title,
        description: notification.message,
        time: `${index + 1} hour ago`,
        read: notification.read,
      }))
      setNotifications(mapped)
    })
  }, [])

  // Memoize mark all as read handler
  const handleMarkAllAsRead = useCallback(() => {
    markAllNotificationsRead().then((updated) => {
      const mapped = updated.map((notification, index) => ({
        id: notification.id,
        type: index % 2 === 0 ? 'booking' : 'payment',
        title: notification.title,
        description: notification.message,
        time: `${index + 1} hour ago`,
        read: notification.read,
      }))
      setNotifications(mapped)
    })
  }, [])

  // Memoize mark single as read handler
  const handleMarkAsRead = useCallback((id: string) => {
    markNotificationRead(id).then(() => {
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)))
    })
  }, [])

  const getNotificationIcon = (type: Notification['type']) => {
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
      
      <div className="notifications-content">
        <div className="page-header">
          <div className="page-title-section">
            <h1 className="page-title">Notifications</h1>
            <p className="page-subtitle">Stay updated with your business activities</p>
          </div>
          {unreadCount > 0 && (
            <button 
              className="mark-all-read-btn"
              onClick={handleMarkAllAsRead}
            >
              Mark All as Read
            </button>
          )}
        </div>

        <div className="notifications-card">
          <div className="notifications-list">
            {notifications.length === 0 ? (
              <div className="empty-state">
                <p>No notifications</p>
              </div>
            ) : (
              notifications.map((notification) => (
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
