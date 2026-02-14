import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  Globe,
  Lock,
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
import './AccountSettings.css'

type SettingsSection = 'profile' | 'security' | 'notifications' | 'preferences' | 'verification' | 'privacy'

export function AccountSettings() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile')
  const sections = [
    { id: 'profile' as SettingsSection, label: 'Profile', icon: <User size={16} /> },
    { id: 'security' as SettingsSection, label: 'Security', icon: <Lock size={16} /> },
    { id: 'notifications' as SettingsSection, label: 'Notifications', icon: <Bell size={16} /> },
    { id: 'preferences' as SettingsSection, label: 'Preferences', icon: <SlidersHorizontal size={16} /> },
    { id: 'verification' as SettingsSection, label: 'Verification', icon: <BadgeCheck size={16} /> },
    { id: 'privacy' as SettingsSection, label: 'Privacy', icon: <Shield size={16} /> },
  ]

  const renderSection = () => {
    switch (activeSection) {
      case 'profile':
        return <ProfileSection />
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

  return (
    <div className="account-settings-page">
      <Header />
      
      <div className="account-settings-container">
        <div className="account-settings-header">
          <Link to="/dashboard" className="back-button">
            <ArrowLeft size={14} />
            Back to Dashboard
          </Link>
          <Link to="/" className="browse-cars-button">
            <Globe size={14} />
            Browse Cars
          </Link>
        </div>

        <div className="account-settings-content">
          <div className="settings-header">
            <div className="settings-title-section">
              <h1 className="settings-title">Account Settings</h1>
              <p className="settings-description">Manage your account preferences and security settings</p>
            </div>
            <button className="back-to-site-button" type="button" onClick={() => navigate('/')}>
              <Globe size={14} />
              Back to Site
            </button>
          </div>

          <div className="settings-layout">
            <div className="settings-sidebar">
              <nav className="settings-nav">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
                    onClick={() => setActiveSection(section.id)}
                  >
                    <span className="nav-icon">{section.icon}</span>
                    <span className="nav-label">{section.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <div className="settings-main">
              {renderSection()}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}

