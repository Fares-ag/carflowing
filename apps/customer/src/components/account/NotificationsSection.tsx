import { useState } from 'react'
import { Check } from 'lucide-react'
import './NotificationsSection.css'

export default function NotificationsSection() {
  const [notifications, setNotifications] = useState({
    emailRentalUpdates: true,
    smsRentalUpdates: true,
    reminderNotifications: true,
    emailPromotions: false,
    smsPromotions: false,
    weeklyDigest: true,
    pushNotifications: true,
  })

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications({
      ...notifications,
      [key]: !notifications[key],
    })
  }

  return (
    <div className="notifications-section">
      <h2 className="section-title">Notification Preferences</h2>

      <div className="notifications-content">
        <div className="notification-group">
          <h4 className="group-title">Rental Notifications</h4>
          
          <div className="notification-item">
            <div className="notification-info">
              <label className="notification-label">Email Rental Updates</label>
              <p className="notification-description">Booking confirmations and rental updates</p>
            </div>
            <button 
              className={`toggle-switch ${notifications.emailRentalUpdates ? 'active' : ''}`}
              onClick={() => toggleNotification('emailRentalUpdates')}
            >
              <span className="toggle-slider"></span>
            </button>
          </div>

          <div className="notification-item">
            <div className="notification-info">
              <label className="notification-label">SMS Rental Updates</label>
              <p className="notification-description">Important rental notifications via SMS</p>
            </div>
            <button 
              className={`toggle-switch ${notifications.smsRentalUpdates ? 'active' : ''}`}
              onClick={() => toggleNotification('smsRentalUpdates')}
            >
              <span className="toggle-slider"></span>
            </button>
          </div>

          <div className="notification-item">
            <div className="notification-info">
              <label className="notification-label">Reminder Notifications</label>
              <p className="notification-description">Pickup and return reminders</p>
            </div>
            <button 
              className={`toggle-switch ${notifications.reminderNotifications ? 'active' : ''}`}
              onClick={() => toggleNotification('reminderNotifications')}
            >
              <span className="toggle-slider"></span>
            </button>
          </div>
        </div>

        <div className="divider"></div>

        <div className="notification-group">
          <h4 className="group-title">Marketing & Promotions</h4>
          
          <div className="notification-item">
            <div className="notification-info">
              <label className="notification-label">Email Promotions</label>
              <p className="notification-description">Special offers and promotional content</p>
            </div>
            <button 
              className={`toggle-switch ${notifications.emailPromotions ? 'active' : ''}`}
              onClick={() => toggleNotification('emailPromotions')}
            >
              <span className="toggle-slider"></span>
            </button>
          </div>

          <div className="notification-item">
            <div className="notification-info">
              <label className="notification-label">SMS Promotions</label>
              <p className="notification-description">Exclusive deals via SMS</p>
            </div>
            <button 
              className={`toggle-switch ${notifications.smsPromotions ? 'active' : ''}`}
              onClick={() => toggleNotification('smsPromotions')}
            >
              <span className="toggle-slider"></span>
            </button>
          </div>

          <div className="notification-item">
            <div className="notification-info">
              <label className="notification-label">Weekly Digest</label>
              <p className="notification-description">Weekly summary of new cars and offers</p>
            </div>
            <button 
              className={`toggle-switch ${notifications.weeklyDigest ? 'active' : ''}`}
              onClick={() => toggleNotification('weeklyDigest')}
            >
              <span className="toggle-slider"></span>
            </button>
          </div>
        </div>

        <div className="divider"></div>

        <div className="notification-group">
          <h4 className="group-title">App Notifications</h4>
          
          <div className="notification-item">
            <div className="notification-info">
              <label className="notification-label">Push Notifications</label>
              <p className="notification-description">Receive notifications on your mobile device</p>
            </div>
            <button 
              className={`toggle-switch ${notifications.pushNotifications ? 'active' : ''}`}
              onClick={() => toggleNotification('pushNotifications')}
            >
              <span className="toggle-slider"></span>
            </button>
          </div>
        </div>

        <div className="section-actions">
          <button className="save-button">
            <Check size={14} />
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  )
}

