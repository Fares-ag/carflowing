import { useEffect, useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { getAppSettings, updateAppSettings } from '../services/adminService'
import './SettingsPage.css'

export function SettingsPage() {
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [supportPhone, setSupportPhone] = useState('')
  const [defaultTaxRate, setDefaultTaxRate] = useState(0.05)
  const [isLoading, setIsLoading] = useState(true)
  const [saveMessage, setSaveMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getAppSettings()
      .then((data) => {
        if (!active) return
        setSettingsId(data.id)
        setCompanyName(data.companyName)
        setSupportEmail(data.supportEmail)
        setSupportPhone(data.supportPhone ?? '')
        setDefaultTaxRate(data.defaultTaxRate)
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

  const handleSave = async () => {
    if (!settingsId) return
    setSaveMessage('')
    setError('')
    try {
      await updateAppSettings(settingsId, {
        companyName,
        supportEmail,
        supportPhone: supportPhone || undefined,
        defaultTaxRate,
      })
      setSaveMessage('Settings updated.')
      window.setTimeout(() => setSaveMessage(''), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings')
    }
  }

  return (
    <AdminLayout title="Settings" subtitle="System preferences and support details">
      <div className="adminSettings">
        {isLoading ? <div className="adminSettingsLoading">Loading settings...</div> : null}
        {error ? <div className="adminSettingsError">{error}</div> : null}
        {!isLoading ? (
          <div className="adminSettingsCard">
            <div className="adminSettingsRow">
              <label>
                Company Name
                <input
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                />
              </label>
              <label>
                Support Email
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(event) => setSupportEmail(event.target.value)}
                />
              </label>
            </div>
            <div className="adminSettingsRow">
              <label>
                Support Phone
                <input
                  type="tel"
                  value={supportPhone}
                  onChange={(event) => setSupportPhone(event.target.value)}
                />
              </label>
              <label>
                Default Tax Rate
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={defaultTaxRate}
                  onChange={(event) => setDefaultTaxRate(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="adminSettingsActions">
              <button type="button" className="adminSettingsButton" onClick={handleSave}>
                Save Settings
              </button>
              {saveMessage ? <span className="adminSettingsMessage">{saveMessage}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  )
}
