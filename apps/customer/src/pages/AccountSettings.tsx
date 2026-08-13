import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  CreditCard,
  Heart,
  Lock,
  LogOut,
  Shield,
  SlidersHorizontal,
  User,
} from 'lucide-react'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import ProfileSection from '../components/account/ProfileSection'
import SecuritySection from '../components/account/SecuritySection'
import NotificationsSection from '../components/account/NotificationsSection'
import PreferencesSection from '../components/account/PreferencesSection'
import VerificationSection from '../components/account/VerificationSection'
import PrivacySection from '../components/account/PrivacySection'
import SavedCarsSection from '../components/account/SavedCarsSection'
import BillingSection from '../components/account/BillingSection'
import { useAuth } from '../contexts/AuthContext'
import './AccountSettings.css'

type SettingsSection =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'preferences'
  | 'verification'
  | 'privacy'
  | 'saved'
  | 'billing'

const VALID_SECTIONS: SettingsSection[] = [
  'profile',
  'security',
  'notifications',
  'preferences',
  'verification',
  'privacy',
  'saved',
  'billing',
]

function parseSection(value: string | null): SettingsSection {
  if (value && VALID_SECTIONS.includes(value as SettingsSection)) {
    return value as SettingsSection
  }
  return 'profile'
}

export function AccountSettings() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { logout } = useAuth()
  const [activeSection, setActiveSection] = useState<SettingsSection>(() =>
    parseSection(searchParams.get('section'))
  )

  useEffect(() => {
    setActiveSection(parseSection(searchParams.get('section')))
  }, [searchParams])

  const selectSection = (section: SettingsSection) => {
    setActiveSection(section)
    setSearchParams(section === 'profile' ? {} : { section })
  }

  const sections = [
    { id: 'profile' as SettingsSection, label: 'Profile', icon: <User size={16} /> },
    { id: 'saved' as SettingsSection, label: 'Saved cars', icon: <Heart size={16} /> },
    { id: 'verification' as SettingsSection, label: 'Verification', icon: <BadgeCheck size={16} /> },
    { id: 'security' as SettingsSection, label: 'Security', icon: <Lock size={16} /> },
    { id: 'notifications' as SettingsSection, label: 'Notifications', icon: <Bell size={16} /> },
    { id: 'preferences' as SettingsSection, label: 'Preferences', icon: <SlidersHorizontal size={16} /> },
    { id: 'billing' as SettingsSection, label: 'Billing', icon: <CreditCard size={16} /> },
    { id: 'privacy' as SettingsSection, label: 'Privacy', icon: <Shield size={16} /> },
  ]

  const renderSection = () => {
    switch (activeSection) {
      case 'profile':
        return <ProfileSection />
      case 'saved':
        return <SavedCarsSection />
      case 'billing':
        return <BillingSection />
      case 'security':
        return <SecuritySection />
      case 'notifications':
        return <NotificationsSection />
      case 'preferences':
        return <PreferencesSection />
      case 'verification':
        return <VerificationSection />
      case 'privacy':
        return <PrivacySection />
      default:
        return <ProfileSection />
    }
  }

  const handleSignOut = async () => {
    await logout()
    navigate('/browse')
  }

  return (
    <div className="account-settings-page">
      <Header />

      <div className="account-settings-container">
        <div className="account-settings-header">
          <Link to="/my-booking" className="back-button">
            <ArrowLeft size={14} />
            My booking
          </Link>
          <Link to="/browse" className="browse-cars-button">
            Browse
          </Link>
        </div>

        <div className="account-settings-content">
          <div className="settings-header">
            <div className="settings-title-section">
              <h1 className="settings-title">Account</h1>
              <p className="settings-description">Profile, documents, saved cars, and preferences</p>
            </div>
            <button className="account-sign-out" type="button" onClick={handleSignOut}>
              <LogOut size={14} />
              Sign out
            </button>
          </div>

          <div className="settings-layout">
            <div className="settings-sidebar">
              <nav className="settings-nav">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
                    onClick={() => selectSection(section.id)}
                  >
                    <span className="nav-icon">{section.icon}</span>
                    <span className="nav-label">{section.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <div className="settings-main">{renderSection()}</div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
