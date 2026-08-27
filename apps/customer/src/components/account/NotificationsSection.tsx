import { Check, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from '../../hooks/useToast'
import { t } from '../../i18n'
import { getPreferences, updatePreferences } from '../../services/customerService'
import './NotificationsSection.css'

type NotificationPrefs = {
  emailRentalUpdates: boolean
  smsRentalUpdates: boolean
  whatsappRentalUpdates: boolean
  reminderNotifications: boolean
  emailPromotions: boolean
  smsPromotions: boolean
  weeklyDigest: boolean
  pushNotifications: boolean
}

const DEFAULT_PREFS: NotificationPrefs = {
  emailRentalUpdates: true,
  smsRentalUpdates: true,
  whatsappRentalUpdates: false,
  reminderNotifications: true,
  emailPromotions: false,
  smsPromotions: false,
  weeklyDigest: true,
  pushNotifications: true,
}

function fromServer(prefs: {
  emailNotifications: boolean
  smsNotifications: boolean
  whatsappNotifications?: boolean
  pushNotifications: boolean
  marketingEmails: boolean
}): NotificationPrefs {
  return {
    emailRentalUpdates: prefs.emailNotifications,
    smsRentalUpdates: prefs.smsNotifications,
    whatsappRentalUpdates: prefs.whatsappNotifications ?? false,
    reminderNotifications: prefs.emailNotifications,
    emailPromotions: prefs.marketingEmails,
    smsPromotions: prefs.marketingEmails,
    weeklyDigest: prefs.marketingEmails,
    pushNotifications: prefs.pushNotifications,
  }
}

function toServer(prefs: NotificationPrefs) {
  return {
    emailNotifications: prefs.emailRentalUpdates || prefs.reminderNotifications,
    smsNotifications: prefs.smsRentalUpdates,
    whatsappNotifications: prefs.whatsappRentalUpdates,
    pushNotifications: prefs.pushNotifications,
    marketingEmails:
      prefs.emailPromotions || prefs.smsPromotions || prefs.weeklyDigest,
  }
}

export default function NotificationsSection() {
  const [notifications, setNotifications] = useState(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getPreferences()
      .then((prefs) => setNotifications(fromServer(prefs)))
      .catch(() => {
        /* keep defaults */
      })
      .finally(() => setLoading(false))
  }, [])

  const toggleNotification = (key: keyof NotificationPrefs) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updatePreferences(toServer(notifications))
      toast.success(t('notifications.saved'))
    } catch {
      toast.error(t('notifications.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="notifications-section">
      <h2 className="section-title">Notification Preferences</h2>

      <div className="notifications-local-banner" role="status">
        <Info size={16} aria-hidden />
        <p>Preferences are synced with your account.</p>
      </div>

      {loading ? (
        <p className="notifications-loading">Loading preferences…</p>
      ) : (
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
                <label className="notification-label">WhatsApp Rental Updates</label>
                <p className="notification-description">
                  Booking approvals, invoice due/overdue, and payment confirmations via WhatsApp
                </p>
              </div>
              <button
                className={`toggle-switch ${notifications.whatsappRentalUpdates ? 'active' : ''}`}
                onClick={() => toggleNotification('whatsappRentalUpdates')}
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
            <button type="button" className="save-button" disabled={saving} onClick={() => void handleSave()}>
              <Check size={14} />
              {saving ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
