import { Check, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from '../../hooks/useToast'
import { setLocale, type Locale } from '../../i18n'
import { getPreferences, updatePreferences } from '../../services/customerService'
import './PreferencesSection.css'

const PREFERENCES_KEY = 'carflow-preferences'

type PreferencesState = {
  language: string
  currency: string
  distanceUnit: string
  theme: string
  timezone: string
  showProfile: boolean
  autoRenew: boolean
}

const DEFAULT_PREFERENCES: PreferencesState = {
  language: 'English',
  currency: 'QAR (Qatari Riyal)',
  distanceUnit: 'Kilometers',
  theme: 'Light',
  timezone: 'Qatar (GMT+3)',
  showProfile: true,
  autoRenew: false,
}

function loadLocalPreferences(): Partial<PreferencesState> {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY)
    if (raw) {
      return JSON.parse(raw) as Partial<PreferencesState>
    }
  } catch {
    // ignore
  }
  return {}
}

function themeFromServer(value: string): string {
  if (value === 'dark') return 'Dark'
  if (value === 'system') return 'System'
  return 'Light'
}

function themeToServer(value: string): string {
  if (value === 'Dark') return 'dark'
  if (value === 'System') return 'system'
  return 'light'
}

function localeFromServer(value: string): string {
  return value === 'ar' ? 'Arabic' : 'English'
}

function localeToServer(value: string): Locale {
  return value === 'Arabic' ? 'ar' : 'en'
}

export default function PreferencesSection() {
  const [preferences, setPreferences] = useState<PreferencesState>(DEFAULT_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const local = loadLocalPreferences()
    getPreferences()
      .then((server) => {
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...local,
          language: localeFromServer(server.locale),
          theme: themeFromServer(server.theme),
        })
      })
      .catch(() => {
        setPreferences({ ...DEFAULT_PREFERENCES, ...local })
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const { language, theme, ...localOnly } = preferences
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(localOnly))
      await updatePreferences({
        locale: localeToServer(language),
        theme: themeToServer(theme),
      })
      setLocale(localeToServer(language))
      toast.success('Preferences saved.')
    } catch {
      toast.error('Could not save preferences.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="preferences-section">
      <h2 className="section-title">App Preferences</h2>

      <div className="preferences-local-note" role="status">
        <Info size={16} aria-hidden />
        <p>Language and theme sync with your account. Other settings are saved locally.</p>
      </div>

      {loading ? (
        <p className="preferences-loading">Loading preferences…</p>
      ) : (
        <div className="preferences-content">
          <div className="preferences-grid">
            <div className="preference-field">
              <label>Language</label>
              <select
                className="form-select"
                value={preferences.language}
                onChange={(e) => setPreferences({ ...preferences, language: e.target.value })}
              >
                <option value="English">English</option>
                <option value="Arabic">Arabic</option>
              </select>
            </div>

            <div className="preference-field">
              <label>Currency</label>
              <select
                className="form-select"
                value={preferences.currency}
                onChange={(e) => setPreferences({ ...preferences, currency: e.target.value })}
              >
                <option value="QAR (Qatari Riyal)">QAR (Qatari Riyal)</option>
                <option value="USD (US Dollar)">USD (US Dollar)</option>
                <option value="EUR (Euro)">EUR (Euro)</option>
              </select>
            </div>

            <div className="preference-field">
              <label>Distance Unit</label>
              <select
                className="form-select"
                value={preferences.distanceUnit}
                onChange={(e) => setPreferences({ ...preferences, distanceUnit: e.target.value })}
              >
                <option value="Kilometers">Kilometers</option>
                <option value="Miles">Miles</option>
              </select>
            </div>

            <div className="preference-field">
              <label>Theme</label>
              <select
                className="form-select"
                value={preferences.theme}
                onChange={(e) => setPreferences({ ...preferences, theme: e.target.value })}
              >
                <option value="Light">Light</option>
                <option value="Dark">Dark</option>
                <option value="System">System</option>
              </select>
            </div>

            <div className="preference-field">
              <label>Timezone</label>
              <select
                className="form-select"
                value={preferences.timezone}
                onChange={(e) => setPreferences({ ...preferences, timezone: e.target.value })}
              >
                <option value="Qatar (GMT+3)">Qatar (GMT+3)</option>
                <option value="UAE (GMT+4)">UAE (GMT+4)</option>
                <option value="Saudi Arabia (GMT+3)">Saudi Arabia (GMT+3)</option>
              </select>
            </div>
          </div>

          <div className="divider"></div>

          <div className="privacy-preferences">
            <h4 className="group-title">Privacy Preferences</h4>

            <div className="preference-item">
              <div className="preference-info">
                <label className="preference-label">Show Profile to Dealers</label>
                <p className="preference-description">Allow dealers to see your basic profile when reviewing requests</p>
              </div>
              <button
                type="button"
                className={`toggle-switch ${preferences.showProfile ? 'active' : ''}`}
                onClick={() => setPreferences({ ...preferences, showProfile: !preferences.showProfile })}
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
