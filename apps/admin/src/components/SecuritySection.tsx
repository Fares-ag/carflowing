import { useCallback, useEffect, useMemo, useState } from 'react'
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
 * TOTP enrolment for the signed-in staff account, on the role-agnostic
 * `/api/auth/security` router. Staff 2FA becomes mandatory behind a backend
 * flag (`totpRequired` in the status payload); without this UI an operator has
 * no way to enrol at all.
 */
export function SecuritySection({ email }: { email?: string }) {
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [setupUri, setSetupUri] = useState('')
  const [setupSecret, setSetupSecret] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoadError('')
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

  // Never render a partial code: if encoding fails the setup key below is the
  // working fallback.
  const qrMarkup = useMemo(() => {
    if (!setupUri) return null
    try {
      return qrCodeSvg(setupUri)
    } catch {
      return null
    }
  }, [setupUri])

  const totpEnabled = status?.totpEnabled ?? false

  const handleStartSetup = async () => {
    setBusy(true)
    try {
      // Re-running setup rotates the secret, which the backend guards with a
      // current code when 2FA is already on.
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
  }

  const handleEnable = async () => {
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
  }

  const handleDisable = async () => {
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
  }

  return (
    <div className="adminSettingsCard">
      <h2 className="adminSettingsSectionTitle">Your account security</h2>
      <p className="adminSettingsHint">
        Two-factor authentication for {email ?? 'the signed-in staff account'}, using a time-based code
        from an authenticator app.
      </p>

      <div className="adminSecurityStatusRow">
        <span className={`adminSecurityBadge adminSecurityBadge--${totpEnabled ? 'on' : 'off'}`}>
          {loading ? 'Checking…' : totpEnabled ? '2FA enabled' : '2FA not enabled'}
        </span>
      </div>

      {loadError ? <div className="adminSettingsError">{loadError}</div> : null}

      {status?.totpRequired && !totpEnabled ? (
        <div className="adminSecurityWarning" role="alert">
          Two-factor authentication is required for staff accounts. Enrol now — sign-in will be refused
          until you do.
        </div>
      ) : null}

      {!setupUri ? (
        <div className="adminSettingsActions">
          <button
            type="button"
            className="adminSettingsButton"
            disabled={busy || loading}
            onClick={() => void handleStartSetup()}
          >
            {totpEnabled ? 'Re-enrol authenticator' : 'Enable two-factor authentication'}
          </button>
          {totpEnabled ? (
            <button
              type="button"
              className="adminSettingsButtonSecondary"
              disabled={busy || status?.totpRequired}
              onClick={() => void handleDisable()}
            >
              Disable
            </button>
          ) : null}
        </div>
      ) : (
        <div className="adminSecuritySetup">
          <ol className="adminSecuritySteps">
            <li>Scan this code with Google Authenticator, Microsoft Authenticator or 1Password.</li>
            <li>Enter the 6-digit code it shows to finish enrolment.</li>
          </ol>

          <div className="adminSecuritySetupBody">
            {qrMarkup ? (
              <div
                className="adminSecurityQr"
                role="img"
                aria-label="Two-factor authentication setup QR code"
                dangerouslySetInnerHTML={{ __html: qrMarkup }}
              />
            ) : (
              <div className="adminSecurityQr adminSecurityQr--unavailable">
                QR code unavailable — add the key manually.
              </div>
            )}

            <div className="adminSecurityManual">
              <span className="adminSettingsHint">Setup key</span>
              <code className="adminSecuritySecret">{setupSecret}</code>
              <a className="adminSecurityUri" href={setupUri}>
                Open in your authenticator app
              </a>
            </div>
          </div>

          <div className="adminSettingsRow">
            <label>
              Authentication code
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
          </div>

          <div className="adminSettingsActions">
            <button
              type="button"
              className="adminSettingsButton"
              disabled={busy || code.length < 6}
              onClick={() => void handleEnable()}
            >
              {busy ? 'Verifying…' : 'Confirm & enable'}
            </button>
            <button
              type="button"
              className="adminSettingsButtonSecondary"
              disabled={busy}
              onClick={() => {
                setSetupSecret('')
                setSetupUri('')
                setCode('')
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
