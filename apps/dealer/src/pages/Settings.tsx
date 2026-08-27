import { formatDate, uploadAvatar } from '@carflow/shared'
import {
  Bell,
  Building2,
  Lock,
  Shield,
  SlidersHorizontal,
  Terminal,
  Upload,
  Check,
  Wallet,
} from 'lucide-react'
import { useState, useCallback, memo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/Header'
import { SecuritySection } from '../components/SecuritySection'
import { Sidebar } from '../components/Sidebar'
import { getCurrentUser } from '../services/authService'
import { getDealerSettings, listNotifications, updateDealerSettings } from '../services/dealerService'
import './Settings.css'

type SettingsTab = 'business' | 'notifications' | 'preferences' | 'security' | 'privacy' | 'api'

interface BusinessHours {
  day: string
  enabled: boolean
  startTime: string
  endTime: string
}

export const Settings = memo(function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('business')
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [bankAccountName, setBankAccountName] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankIban, setBankIban] = useState('')
  const [bankVerifiedAt, setBankVerifiedAt] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [businessHours, setBusinessHours] = useState<BusinessHours[]>([
    { day: 'monday', enabled: true, startTime: '09:00', endTime: '18:00' },
    { day: 'tuesday', enabled: true, startTime: '09:00', endTime: '18:00' },
    { day: 'wednesday', enabled: true, startTime: '09:00', endTime: '18:00' },
    { day: 'thursday', enabled: true, startTime: '09:00', endTime: '18:00' },
    { day: 'friday', enabled: true, startTime: '09:00', endTime: '18:00' },
    { day: 'saturday', enabled: true, startTime: '09:00', endTime: '18:00' },
    { day: 'sunday', enabled: false, startTime: '09:00', endTime: '18:00' },
  ])
  const [recentNotifications, setRecentNotifications] = useState<Array<{ id: string; title: string; message: string }>>([])
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    Promise.all([getDealerSettings(), listNotifications({ pageSize: 5 }), getCurrentUser()])
      .then(([settings, notifications, user]) => {
        if (!active) return
        setSettingsId(settings.id)
        setBusinessName(settings.name)
        setContactEmail(settings.contactEmail)
        setContactPhone(settings.contactPhone ?? '')
        setWebsite(settings.website ?? '')
        setAddress(settings.address ?? '')
        setDescription(settings.description ?? '')
        setLicenseNumber(settings.licenseNumber ?? '')
        setBankAccountName(settings.bankAccountName ?? '')
        setBankName(settings.bankName ?? '')
        setBankIban(settings.bankIban ?? '')
        setBankVerifiedAt(settings.bankDetailsVerifiedAt ?? null)
        setBusinessHours(settings.businessHours.length ? settings.businessHours : businessHours)
        setLogoUrl(settings.logoUrl ?? null)
        setRecentNotifications(
          notifications.items.map((notification) => ({
            id: notification.id,
            title: notification.title,
            message: notification.message,
          }))
        )
        setCurrentUser(user ? { name: user.name, email: user.email } : null)
        setIsLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unable to load settings')
        setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const handleTabChange = useCallback((tab: SettingsTab) => {
    setActiveTab(tab)
  }, [])

  const handleBusinessHoursToggle = useCallback((day: string) => {
    setBusinessHours(prev => prev.map(h => 
      h.day === day ? { ...h, enabled: !h.enabled } : h
    ))
  }, [])

  const handleBusinessHoursChange = useCallback((day: string, field: 'startTime' | 'endTime', value: string) => {
    setBusinessHours(prev => prev.map(h => 
      h.day === day ? { ...h, [field]: value } : h
    ))
  }, [])

  const handleSaveSettings = useCallback(async () => {
    if (!settingsId) return
    setError(null)
    try {
      const updated = await updateDealerSettings({
        name: businessName,
        contactEmail,
        contactPhone: contactPhone || undefined,
        website: website || undefined,
        address: address || undefined,
        description: description || undefined,
        licenseNumber: licenseNumber || undefined,
        bankAccountName: bankAccountName || undefined,
        bankName: bankName || undefined,
        bankIban: bankIban || undefined,
        businessHours,
        logoUrl: logoUrl ?? undefined,
      })
      setBankVerifiedAt(updated.bankDetailsVerifiedAt ?? null)
      setSaveMessage('Business settings saved.')
      window.setTimeout(() => setSaveMessage(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings')
    }
  }, [
    settingsId,
    businessName,
    contactEmail,
    contactPhone,
    website,
    address,
    description,
    licenseNumber,
    bankAccountName,
    bankName,
    bankIban,
    businessHours,
    logoUrl,
  ])

  const handleUploadLogo = useCallback(() => {
    logoInputRef.current?.click()
  }, [])

  const formatDayName = (day: string) => {
    return day.charAt(0).toUpperCase() + day.slice(1)
  }

  return (
    <div className="settings-page">
      <Sidebar />
      <Header />

      <div className="settings-content" role="main">
        <div className="page-header">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your business profile, preferences, and security</p>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'business' ? 'active' : ''}`}
            onClick={() => handleTabChange('business')}
          >
            <Building2 size={14} />
            Business
          </button>
          <button
            className={`settings-tab ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => handleTabChange('notifications')}
          >
            <Bell size={14} />
            Notifications
          </button>
          <button
            className={`settings-tab ${activeTab === 'preferences' ? 'active' : ''}`}
            onClick={() => handleTabChange('preferences')}
          >
            <SlidersHorizontal size={14} />
            Preferences
          </button>
          <button
            className={`settings-tab ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => handleTabChange('security')}
          >
            <Lock size={14} />
            Security
          </button>
          <button
            className={`settings-tab ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => handleTabChange('privacy')}
          >
            <Shield size={14} />
            Privacy
          </button>
          <button
            className={`settings-tab ${activeTab === 'api' ? 'active' : ''}`}
            onClick={() => handleTabChange('api')}
          >
            <Terminal size={14} />
            API
          </button>
        </div>

        <div className="settings-tab-content">
          {isLoading ? <div className="settings-loading">Loading settings...</div> : null}
          {error ? <div className="settings-error">{error}</div> : null}
          {activeTab === 'business' && (
            <div className="business-tab">
              <div className="settings-cards-grid">
                <div className="settings-card">
                  <div className="card-header">
                    <Building2 size={18} />
                    <h3 className="card-title">Business Information</h3>
                  </div>
                  <p className="card-description">Update your business profile and contact details</p>
                  
                  <div className="form-group">
                    <label>Business Name *</label>
                    <input
                      type="text"
                      placeholder="Your Company"
                      value={businessName}
                      onChange={(event) => setBusinessName(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      placeholder="contact@yourcompany.com"
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number *</label>
                    <input
                      type="tel"
                      placeholder="+974 0000 0000"
                      value={contactPhone}
                      onChange={(event) => setContactPhone(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Website</label>
                    <input
                      type="url"
                      placeholder="www.premiumcars.qa"
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Business Address *</label>
                    <textarea
                      placeholder="Enter your complete business address"
                      rows={3}
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                    ></textarea>
                  </div>
                  <div className="form-group">
                    <label>Business Description</label>
                    <textarea
                      placeholder="Brief description of your business"
                      rows={3}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    ></textarea>
                  </div>
                </div>

                <div className="settings-card">
                  <div className="card-header">
                    <Shield size={18} />
                    <h3 className="card-title">Legal & Registration</h3>
                  </div>
                  <p className="card-description">Business license and registration details</p>
                  
                  <div className="form-group">
                    <label>Business License Number</label>
                    <input
                      type="text"
                      placeholder="CR-123456789"
                      value={licenseNumber}
                      onChange={(event) => setLicenseNumber(event.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Business Hours</label>
                    <div className="business-hours-list">
                      {businessHours.map((hour) => (
                        <div key={hour.day} className="business-hour-item">
                          <div className="hour-day">{formatDayName(hour.day)}</div>
                          <div className="hour-toggle">
                            <button
                              className={`toggle-switch ${hour.enabled ? 'active' : ''}`}
                              onClick={() => handleBusinessHoursToggle(hour.day)}
                            >
                              <span></span>
                            </button>
                          </div>
                          {hour.enabled ? (
                            <div className="hour-time-inputs">
                              <input
                                type="time"
                                value={hour.startTime}
                                onChange={(e) => handleBusinessHoursChange(hour.day, 'startTime', e.target.value)}
                              />
                              <span className="time-separator">to</span>
                              <input
                                type="time"
                                value={hour.endTime}
                                onChange={(e) => handleBusinessHoursChange(hour.day, 'endTime', e.target.value)}
                              />
                            </div>
                          ) : (
                            <div className="hour-closed">Closed</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="settings-card">
                  <div className="card-header">
                    <Wallet size={18} />
                    <h3 className="card-title">Payout bank details</h3>
                  </div>
                  <p className="card-description">
                    Required for monthly dealer payouts. CarFlow admin verifies your IBAN before transfers.
                  </p>
                  {bankVerifiedAt ? (
                    <div className="settings-info-banner settings-info-banner--success">
                      Verified {formatDate(bankVerifiedAt)}
                    </div>
                  ) : bankIban.trim() ? (
                    <div className="settings-info-banner">
                      Submitted — awaiting admin verification before payouts can be sent.
                    </div>
                  ) : (
                    <div className="settings-info-banner">
                      Add your bank details so we can pay you when rentals settle.
                    </div>
                  )}
                  <div className="form-group">
                    <label>Account holder name</label>
                    <input
                      type="text"
                      placeholder="Legal business name on account"
                      value={bankAccountName}
                      onChange={(event) => setBankAccountName(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Bank name</label>
                    <input
                      type="text"
                      placeholder="e.g. QNB"
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>IBAN</label>
                    <input
                      type="text"
                      placeholder="QA00 XXXX XXXX XXXX XXXX XXXX"
                      value={bankIban}
                      onChange={(event) => setBankIban(event.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="settings-actions">
                <button className="btn-primary" type="button" onClick={handleSaveSettings}>
                  <Check size={14} />
                  Save Business Settings
                </button>
                <button className="btn-secondary" type="button" onClick={handleUploadLogo}>
                  <Upload size={14} />
                  Upload Logo
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (event) => {
                    if (!event.target.files?.length || !settingsId) return
                    const file = event.target.files[0]
                    try {
                      const user = await getCurrentUser()
                      if (!user) throw new Error('Not authenticated')
                      const publicUrl = await uploadAvatar(file, user.id)
                      setLogoUrl(publicUrl)
                      await updateDealerSettings({ logoUrl: publicUrl })
                      setSaveMessage('Logo uploaded successfully.')
                      window.setTimeout(() => setSaveMessage(null), 2500)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Upload failed')
                    }
                  }}
                />
                {saveMessage && <div className="settings-action-message">{saveMessage}</div>}
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="notifications-settings-tab">
              <div className="settings-info-banner">
                Notification preferences are read-only in this release.
              </div>
              {recentNotifications.length === 0 ? (
                <p>No recent notifications.</p>
              ) : (
                <>
                  <ul className="settings-list">
                    {recentNotifications.map((notification) => (
                      <li key={notification.id}>
                        <strong>{notification.title}</strong>
                        <span>{notification.message}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to="/notifications" className="settings-view-all-link">
                    View all
                  </Link>
                </>
              )}
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="preferences-settings-tab">
              <div className="settings-info-banner">
                Preferences editing is not available in this release.
              </div>
              <p>Business hours are applied across your listings.</p>
              <div className="settings-list">
                {businessHours.map((hour) => (
                  <div key={hour.day}>
                    {formatDayName(hour.day)}: {hour.enabled ? `${hour.startTime} - ${hour.endTime}` : 'Closed'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="security-settings-tab">
              <p>Signed in as {currentUser?.email ?? 'dealer'}.</p>
              <SecuritySection email={currentUser?.email} />
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="privacy-settings-tab">
              <div className="settings-info-banner">
                Privacy controls are informational here; policy updates will appear in-product when available.
              </div>
              <p>Your business data is only shared with customers during booking.</p>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="api-settings-tab">
              <p>API integration is configured and active.</p>
              <p>Contact support for API documentation and access keys.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
