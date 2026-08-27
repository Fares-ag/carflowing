import { Check, KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  disable2fa,
  enable2fa,
  getSecurityStatus,
  setup2fa,
  type SecurityStatus,
} from '../services/securityService'
import { qrCodeSvg } from '../utils/qrcode'
import './SecuritySection.css'

/**
 * TOTP enrolment for the signed-in dealer account. Mirrors the customer app's
 * SecuritySection: setup returns a secret plus an `otpauth://` URI, the user
 * scans or types it into an authenticator, and enrolment only completes once a
 * live 6-digit code verifies against the secret.
 */
export const SecuritySection = memo(function SecuritySection({ email }: { email?: string }) {
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [setupUri, setSetupUri] = useState('')
  const [setupSecret, setSetupSecret] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      setStatus(await getSecurityStatus())
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load security status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A QR that cannot be encoded must not render half-drawn — the secret below
  // it is always a working fallback.
  const qrMarkup = useMemo(() => {
    if (!setupUri) return null
    try {
      return qrCodeSvg(setupUri)
    } catch {
      return null
    }
  }, [setupUri])

  const totpEnabled = status?.totpEnabled ?? false

  const handleStartSetup = useCallback(async () => {
    setBusy(true)
    try {
      // Re-enrolling while 2FA is on rotates the secret, which the backend
      // treats as a disable and guards with a current code.
      const currentCode = totpEnabled
        ? window.prompt('Enter a current authenticator code to re-enrol this device:')
        : undefined
      if (totpEnabled && !currentCode) return
      const result = await setup2fa(currentCode ?? undefined)
      setSetupSecret(result.secret)
      setSetupUri(result.uri)
      setCode('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to start 2FA setup')
    } finally {
      setBusy(false)
    }
  }, [totpEnabled])

  const handleEnable = useCallback(async () => {
    setBusy(true)
    try {
      await enable2fa(code)
      setSetupSecret('')
      setSetupUri('')
      setCode('')
      await refresh()
      toast.success('Two-factor authentication enabled.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid authentication code')
    } finally {
      setBusy(false)
    }
  }, [code, refresh])

  const handleDisable = useCallback(async () => {
    const currentCode = window.prompt('Enter your authenticator code to disable 2FA:')
    if (!currentCode) return
    setBusy(true)
    try {
      await disable2fa(currentCode)
      await refresh()
      toast.success('Two-factor authentication disabled.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid authentication code')
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const handleCancelSetup = useCallback(() => {
    setSetupSecret('')
    setSetupUri('')
    setCode('')
  }, [])

  return (
    <div className="security-section">
      <div className="security-card">
        <div className="security-card-header">
          <div className="security-card-icon">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h3 className="security-card-title">Two-factor authentication</h3>
            <p className="security-card-subtitle">
              Protect {email ?? 'your dealer account'} with a time-based code from an authenticator app.
            </p>
          </div>
          <span className={`security-status-badge security-status-badge--${totpEnabled ? 'on' : 'off'}`}>
            {loading ? 'Checking…' : totpEnabled ? 'Enabled' : 'Not enabled'}
          </span>
        </div>

        {loadError ? (
          <div className="security-error" role="alert">
            {loadError}
          </div>
        ) : null}

        {status?.totpRequired && !totpEnabled ? (
          <div className="security-warning" role="alert">
            Two-factor authentication is required for this account. Enrol now — sign-in will be refused
            until you do.
          </div>
        ) : null}

        {!setupUri ? (
          <div className="security-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={busy || loading}
              onClick={() => void handleStartSetup()}
            >
              {busy ? <Loader2 size={14} className="security-spin" /> : <KeyRound size={14} />}
              {totpEnabled ? 'Re-enrol authenticator' : 'Enable two-factor authentication'}
            </button>
            {totpEnabled ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || status?.totpRequired}
                onClick={() => void handleDisable()}
              >
                <ShieldOff size={14} />
                Disable
              </button>
            ) : null}
          </div>
        ) : (
          <div className="security-setup">
            <ol className="security-steps">
              <li>Scan this code with Google Authenticator, Microsoft Authenticator or 1Password.</li>
              <li>Enter the 6-digit code it shows to finish enrolment.</li>
            </ol>

            <div className="security-setup-body">
              {qrMarkup ? (
                <div
                  className="security-qr"
                  role="img"
                  aria-label="Two-factor authentication setup QR code"
                  dangerouslySetInnerHTML={{ __html: qrMarkup }}
                />
              ) : (
                <div className="security-qr security-qr--unavailable">
                  QR code unavailable — add the key below manually.
                </div>
              )}

              <div className="security-manual">
                <div className="security-manual-label">Setup key</div>
                <code className="security-secret">{setupSecret}</code>
                <a className="security-uri" href={setupUri}>
                  Open in your authenticator app
                </a>
              </div>
            </div>

            <div className="security-verify">
              <label htmlFor="dealer-totp-code">Authentication code</label>
              <input
                id="dealer-totp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <div className="security-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || code.length < 6}
                  onClick={() => void handleEnable()}
                >
                  <Check size={14} />
                  {busy ? 'Verifying…' : 'Confirm & enable'}
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={handleCancelSetup}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
