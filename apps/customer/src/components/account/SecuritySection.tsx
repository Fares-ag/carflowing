import { MIN_PASSWORD_LENGTH, validatePassword } from '@carflow/shared'

import { KeyRound, LogOut, ShieldCheck, Smartphone } from 'lucide-react'

import type { FormEvent} from 'react';
import { useEffect, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { useNavigate } from 'react-router-dom'

import { toast } from '../../hooks/useToast'

import {
  PHONE_VERIFICATION_QUERY_KEY,
  phoneVerificationBadge,
  usePhoneVerificationStatus,
} from '../../hooks/usePhoneVerificationStatus'

import {

  disable2fa,

  enable2fa,

  sendSmsVerification,

  setup2fa,

  verifySmsCode,

} from '../../services/customerService'

import { t } from '../../i18n'

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

  const queryClient = useQueryClient()

  const { data: securityStatus, isLoading: loadingSecurity, refetch: refetchSecurity } =
    usePhoneVerificationStatus()

  const totpEnabled = securityStatus?.totpEnabled ?? false

  const smsVerified = securityStatus?.smsVerified ?? false

  const smsPhoneMasked = securityStatus?.smsPhone ?? null

  const smsVerificationAvailable = securityStatus?.smsVerificationAvailable ?? false

  const smsDevFallback = securityStatus?.smsDevFallback ?? false

  const phoneBadge = phoneVerificationBadge(securityStatus)

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



  const [show2faSetup, setShow2faSetup] = useState(false)

  const [totpSecret, setTotpSecret] = useState('')

  const [totpUri, setTotpUri] = useState('')

  const [totpCode, setTotpCode] = useState('')

  const [totpBusy, setTotpBusy] = useState(false)



  const [smsPhone, setSmsPhone] = useState('')

  const [smsCode, setSmsCode] = useState('')

  const [smsBusy, setSmsBusy] = useState(false)

  const [smsSent, setSmsSent] = useState(false)



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

    const passwordError = validatePassword(newPassword)

    if (passwordError) {

      setChangeError(passwordError)

      return

    }



    setIsChanging(true)

    try {

      const { changePassword } = await import('../../services/authService')

      await changePassword(currentPassword, newPassword)

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



  const handleStart2faSetup = async () => {

    setTotpBusy(true)

    try {

      const result = await setup2fa()

      setTotpSecret(result.secret)

      setTotpUri(result.uri)

      setShow2faSetup(true)

      setTotpCode('')

    } catch (err) {

      toast.error(err instanceof Error ? err.message : 'Unable to start 2FA setup')

    } finally {

      setTotpBusy(false)

    }

  }



  const handleEnable2fa = async () => {

    setTotpBusy(true)

    try {

      await enable2fa(totpCode)

      await queryClient.invalidateQueries({ queryKey: PHONE_VERIFICATION_QUERY_KEY })

      setShow2faSetup(false)

      setTotpSecret('')

      setTotpUri('')

      setTotpCode('')

      toast.success('Two-factor authentication enabled.')

    } catch (err) {

      toast.error(err instanceof Error ? err.message : 'Invalid authentication code')

    } finally {

      setTotpBusy(false)

    }

  }



  const handleDisable2fa = async () => {

    const code = window.prompt('Enter your authenticator code to disable 2FA:')

    if (!code) return

    setTotpBusy(true)

    try {

      await disable2fa(code)

      await queryClient.invalidateQueries({ queryKey: PHONE_VERIFICATION_QUERY_KEY })

      toast.success('Two-factor authentication disabled.')

    } catch (err) {

      toast.error(err instanceof Error ? err.message : 'Invalid authentication code')

    } finally {

      setTotpBusy(false)

    }

  }



  const handleSendSms = async () => {

    if (!smsPhone.trim()) {

      toast.error('Enter your phone number.')

      return

    }

    setSmsBusy(true)

    try {

      await sendSmsVerification(smsPhone.trim())

      setSmsSent(true)

      toast.success('Verification code sent.')

    } catch (err) {

      toast.error(err instanceof Error ? err.message : 'Unable to send SMS code')

    } finally {

      setSmsBusy(false)

    }

  }



  const handleVerifySms = async () => {

    if (!smsCode.trim()) {

      toast.error('Enter the verification code.')

      return

    }

    setSmsBusy(true)

    try {

      await verifySmsCode(smsCode.trim())

      setSmsSent(false)

      setSmsCode('')

      await refetchSecurity()

      toast.success('Phone number verified.')

    } catch (err) {

      toast.error(err instanceof Error ? err.message : 'Invalid SMS code')

    } finally {

      setSmsBusy(false)

    }

  }



  const handleLogoutAllDevices = async () => {

    const ok = window.confirm(

      'Sign out on all devices? You will need to sign in again on this device.'

    )

    if (!ok) return

    setLoggingOutAll(true)

    try {

      const { logoutAllDevices } = await import('../../services/authService')

      await logoutAllDevices()

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

                  minLength={MIN_PASSWORD_LENGTH}

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

                  minLength={MIN_PASSWORD_LENGTH}

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

            <span className={`status-badge ${totpEnabled ? 'enabled' : 'disabled'}`}>

              {loadingSecurity

                ? '…'

                : totpEnabled

                  ? t('security.2faEnabled')

                  : t('security.2faDisabled')}

            </span>

            {totpEnabled ? (

              <button

                type="button"

                className="toggle-button"

                disabled={totpBusy}

                onClick={() => void handleDisable2fa()}

              >

                {t('security.disable2fa')}

              </button>

            ) : (

              <button

                type="button"

                className="toggle-button"

                disabled={totpBusy || loadingSecurity}

                onClick={() => void handleStart2faSetup()}

              >

                <ShieldCheck size={14} />

                {t('security.enable2fa')}

              </button>

            )}

          </div>

          {show2faSetup && (

            <div className="security-2fa-setup">

              <p>Scan this secret in your authenticator app, or open the URI:</p>

              <code className="security-2fa-secret">{totpSecret}</code>

              <a href={totpUri} className="security-2fa-uri" target="_blank" rel="noreferrer">

                Open in authenticator

              </a>

              <label>

                Verification code

                <input

                  className="form-input"

                  value={totpCode}

                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}

                  inputMode="numeric"

                  placeholder="000000"

                />

              </label>

              <div className="security-2fa-actions">

                <button type="button" className="action-button" onClick={() => setShow2faSetup(false)}>

                  Cancel

                </button>

                <button

                  type="button"

                  className="action-button"

                  disabled={totpBusy || totpCode.length < 6}

                  onClick={() => void handleEnable2fa()}

                >

                  {totpBusy ? 'Verifying…' : 'Confirm & enable'}

                </button>

              </div>

            </div>

          )}

        </div>



        <div className="divider"></div>



        <div className="security-item security-item--stack">

          <div className="security-info">

            <h4 className="security-item-title">SMS verification</h4>

            <p className="security-item-description">

              Verify your phone number for account recovery and SMS alerts

            </p>

          </div>

          {loadingSecurity ? (
            <p className="security-footnote">Loading security settings…</p>
          ) : !smsVerificationAvailable ? (
            <p className="security-footnote security-footnote--muted">
              SMS phone verification is not configured for this environment.
            </p>
          ) : smsVerified ? (
            <p className="security-footnote">
              <Smartphone size={14} /> {phoneBadge.label}: {smsPhoneMasked ?? 'Phone on file'}
            </p>
          ) : (
            <div className="security-sms-form">
              {smsDevFallback ? (
                <p className="security-footnote security-footnote--dev">
                  Development mode: SMS codes are logged on the server instead of being texted.
                </p>
              ) : null}
              <label>

                Phone number

                <input

                  className="form-input"

                  type="tel"

                  value={smsPhone}

                  onChange={(e) => setSmsPhone(e.target.value)}

                  placeholder="+974"

                />

              </label>

              {smsSent && (

                <label>

                  SMS code

                  <input

                    className="form-input"

                    value={smsCode}

                    onChange={(e) => setSmsCode(e.target.value)}

                    inputMode="numeric"

                    placeholder="123456"

                  />

                </label>

              )}

              <div className="security-2fa-actions">

                {!smsSent ? (

                  <button

                    type="button"

                    className="action-button"

                    disabled={smsBusy}

                    onClick={() => void handleSendSms()}

                  >

                    Send code

                  </button>

                ) : (

                  <button

                    type="button"

                    className="action-button"

                    disabled={smsBusy}

                    onClick={() => void handleVerifySms()}

                  >

                    {smsBusy ? 'Verifying…' : t('security.smsVerify')}

                  </button>

                )}

              </div>

            </div>

          )}

        </div>



        <div className="divider"></div>



        <div className="security-preferences">

          <h4 className="security-item-title">Security Preferences</h4>

          <p className="security-local-prefs-note">Session preferences are saved locally.</p>



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


