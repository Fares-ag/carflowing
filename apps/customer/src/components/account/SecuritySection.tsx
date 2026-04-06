import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, LogOut } from 'lucide-react'
import { supabase } from '@carflow/shared'
import { toast } from '../../hooks/useToast'
import './SecuritySection.css'

const SECURITY_PREFS_KEY = 'carflow-security-prefs'

type SecurityPrefs = {
  loginNotifications: boolean
  sessionTimeout: string
}

const DEFAULT_SECURITY_PREFS: SecurityPrefs = {
  loginNotifications: true,
  sessionTimeout: '24 Hours',
}

function loadSecurityPrefs(): SecurityPrefs {
  try {
    const raw = localStorage.getItem(SECURITY_PREFS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SecurityPrefs>
      return {
        loginNotifications:
          typeof parsed.loginNotifications === 'boolean'
            ? parsed.loginNotifications
            : DEFAULT_SECURITY_PREFS.loginNotifications,
        sessionTimeout:
          typeof parsed.sessionTimeout === 'string'
            ? parsed.sessionTimeout
            : DEFAULT_SECURITY_PREFS.sessionTimeout,
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SECURITY_PREFS }
}

function persistSecurityPrefs(prefs: SecurityPrefs) {
  try {
    localStorage.setItem(SECURITY_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

export default function SecuritySection() {
  const navigate = useNavigate()
  const [loginNotifications, setLoginNotifications] = useState(true)
  const [sessionTimeout, setSessionTimeout] = useState('24 Hours')
  const [prefsHydrated, setPrefsHydrated] = useState(false)

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChanging, setIsChanging] = useState(false)
  const [changeError, setChangeError] = useState('')
  const [changeSuccess, setChangeSuccess] = useState('')
  const [loggingOutAll, setLoggingOutAll] = useState(false)

  useEffect(() => {
    const loaded = loadSecurityPrefs()
    setLoginNotifications(loaded.loginNotifications)
    setSessionTimeout(loaded.sessionTimeout)
    setPrefsHydrated(true)
  }, [])

  useEffect(() => {
    if (!prefsHydrated) return
    persistSecurityPrefs({ loginNotifications, sessionTimeout })
  }, [loginNotifications, sessionTimeout, prefsHydrated])

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setChangeError('')
    setChangeSuccess('')

    if (newPassword !== confirmPassword) {
      setChangeError('New password and confirmation do not match.')
      return
    }
    if (newPassword.length < 6) {
      setChangeError('New password must be at least 6 characters.')
      return
    }

    setIsChanging(true)
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (userErr || !userData.user?.email) {
        setChangeError(userErr?.message ?? 'Could not load your account.')
        return
      }
      const email = userData.user.email
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (signErr) {
        setChangeError('Current password is incorrect.')
        return
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) {
        setChangeError(updateErr.message ?? 'Could not update password.')
        return
      }
      setChangeSuccess('Your password has been updated.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setIsChanging(false)
    }
  }

  const handleLogoutAllDevices = async () => {
    const ok = window.confirm(
      'Sign out on all devices? You will need to sign in again on this device.'
    )
    if (!ok) return
    setLoggingOutAll(true)
    try {
      await supabase.auth.signOut({ scope: 'global' })
      navigate('/login')
    } catch {
      toast.error('Failed to sign out. Please try again.')
      setLoggingOutAll(false)
    }
  }

  return (
    <div className="security-section">
      <h2 className="section-title">Password & Authentication</h2>

      <div className="security-content">
        <div className="security-item security-password-block">
          <div className="security-item" style={{ padding: 0, width: '100%' }}>
            <div className="security-info">
              <h4 className="security-item-title">Password</h4>
              <p className="security-item-description">Change your account password</p>
            </div>
            <button
              type="button"
              className="action-button"
              onClick={() => {
                setShowPasswordForm((v) => !v)
                setChangeError('')
                setChangeSuccess('')
              }}
            >
              <KeyRound size={14} />
              {showPasswordForm ? 'Cancel' : 'Change Password'}
            </button>
          </div>

          {showPasswordForm && (
            <form className="password-form" onSubmit={handlePasswordSubmit}>
              <label>
                Current password
                <input
                  type="password"
                  className="form-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  className="form-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  className="form-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </label>
              {changeError && (
                <p className="security-message security-message--error" role="alert">
                  {changeError}
                </p>
              )}
              {changeSuccess && (
                <p className="security-message security-message--success" role="status">
                  {changeSuccess}
                </p>
              )}
              <button type="submit" className="password-form-submit" disabled={isChanging}>
                {isChanging ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>

        <div className="divider"></div>

        <div className="security-item security-item--stack">
          <div className="security-info">
            <h4 className="security-item-title">Two-Factor Authentication</h4>
            <p className="security-item-description">Add an extra layer of security to your account</p>
          </div>
          <div className="security-action-group">
            <span className="status-badge disabled">Disabled</span>
            <button type="button" className="toggle-button" disabled aria-disabled="true">
              Enable
            </button>
          </div>
          <p className="security-footnote">Two-factor authentication setup coming soon</p>
        </div>

        <div className="divider"></div>

        <div className="security-preferences">
          <h4 className="security-item-title">Security Preferences</h4>
          <p className="security-local-prefs-note">These preferences are saved locally.</p>

          <div className="preference-item">
            <div className="preference-info">
              <label className="preference-label">Login Notifications</label>
              <p className="preference-description">Get notified of new login attempts</p>
            </div>
            <button
              type="button"
              className={`toggle-switch ${loginNotifications ? 'active' : ''}`}
              onClick={() => setLoginNotifications(!loginNotifications)}
            >
              <span className="toggle-slider"></span>
            </button>
          </div>

          <div className="preference-item">
            <label className="preference-label">Session Timeout</label>
            <select
              className="form-select"
              value={sessionTimeout}
              onChange={(e) => setSessionTimeout(e.target.value)}
            >
              <option value="1 Hour">1 Hour</option>
              <option value="24 Hours">24 Hours</option>
              <option value="7 Days">7 Days</option>
              <option value="30 Days">30 Days</option>
            </select>
          </div>
        </div>

        <div className="divider"></div>

        <div className="security-item">
          <div className="security-info">
            <h4 className="security-item-title">Active Sessions</h4>
            <p className="security-item-description">Logout from all other devices</p>
          </div>
          <button
            type="button"
            className="action-button danger"
            disabled={loggingOutAll}
            onClick={handleLogoutAllDevices}
          >
            <LogOut size={14} />
            {loggingOutAll ? 'Signing out…' : 'Logout All Devices'}
          </button>
        </div>
      </div>
    </div>
  )
}
