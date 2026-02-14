import { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import './SecuritySection.css'

export default function SecuritySection() {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [loginNotifications, setLoginNotifications] = useState(true)
  const [sessionTimeout, setSessionTimeout] = useState('24 Hours')

  return (
    <div className="security-section">
      <h2 className="section-title">Password & Authentication</h2>

      <div className="security-content">
        <div className="security-item">
          <div className="security-info">
            <h4 className="security-item-title">Password</h4>
            <p className="security-item-description">Change your account password</p>
          </div>
          <button className="action-button">
            <KeyRound size={14} />
            Change Password
          </button>
        </div>

        <div className="divider"></div>

        <div className="security-item">
          <div className="security-info">
            <h4 className="security-item-title">Two-Factor Authentication</h4>
            <p className="security-item-description">Add an extra layer of security to your account</p>
          </div>
          <div className="security-action-group">
            <span className={`status-badge ${twoFactorEnabled ? 'enabled' : 'disabled'}`}>
              {twoFactorEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <button 
              className="toggle-button"
              onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
            >
              {twoFactorEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>

        <div className="divider"></div>

        <div className="security-preferences">
          <h4 className="security-item-title">Security Preferences</h4>
          
          <div className="preference-item">
            <div className="preference-info">
              <label className="preference-label">Login Notifications</label>
              <p className="preference-description">Get notified of new login attempts</p>
            </div>
            <button 
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
          <button className="action-button danger">
            <LogOut size={14} />
            Logout All Devices
          </button>
        </div>
      </div>
    </div>
  )
}

