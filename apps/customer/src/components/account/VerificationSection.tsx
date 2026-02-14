import { useState } from 'react'
import { AlertTriangle, Car, FileText, Mail, Phone, Upload } from 'lucide-react'
import './VerificationSection.css'

export default function VerificationSection() {
  const [emailVerified, setEmailVerified] = useState(true)
  const [phoneVerified, setPhoneVerified] = useState(true)

  return (
    <div className="verification-section">
      <div className="verification-header">
        <h2 className="section-title">Identity Verification</h2>
        <p className="section-description">Verify your identity to unlock premium features and enhanced security</p>
      </div>

      <div className="verification-content">
        <div className="verification-item">
          <div className="verification-info">
            <div className="verification-icon"><Mail size={18} /></div>
            <div>
              <h4 className="verification-item-title">Email Address</h4>
              <p className="verification-item-value">lkjjh@gmail.com</p>
            </div>
          </div>
          <span className={`status-badge ${emailVerified ? 'verified' : 'pending'}`}>
            {emailVerified ? 'Verified' : 'Pending'}
          </span>
        </div>

        <div className="verification-item">
          <div className="verification-info">
            <div className="verification-icon"><Phone size={18} /></div>
            <div>
              <h4 className="verification-item-title">Phone Number</h4>
              <p className="verification-item-value">+974 5555 1234</p>
            </div>
          </div>
          <span className={`status-badge ${phoneVerified ? 'verified' : 'pending'}`}>
            {phoneVerified ? 'Verified' : 'Pending'}
          </span>
        </div>

        <div className="verification-upload-section">
          <div className="upload-header">
            <label className="upload-label">
              Qatar ID (QID) <span className="required">*</span>
            </label>
            <span className="upload-status">Upload Required</span>
          </div>
          <div className="upload-area">
            <div className="upload-icon"><FileText size={20} /></div>
            <h4 className="upload-title">Upload Your Qatar ID</h4>
            <p className="upload-hint">JPG, PNG or PDF (max. 5MB)</p>
            <button className="upload-button">
              <Upload size={14} />
              Choose File
            </button>
          </div>
        </div>

        <div className="verification-upload-section">
          <div className="upload-header">
            <label className="upload-label">
              Driving License <span className="required">*</span>
            </label>
            <span className="upload-status">Upload Required</span>
          </div>
          <div className="upload-area">
            <div className="upload-icon"><Car size={20} /></div>
            <h4 className="upload-title">Upload Your Driving License</h4>
            <p className="upload-hint">JPG, PNG or PDF (max. 5MB)</p>
            <button className="upload-button">
              <Upload size={14} />
              Choose File
            </button>
          </div>
        </div>

        <div className="verification-alert">
          <AlertTriangle size={14} />
          <p>Complete verification to unlock premium car rental features</p>
        </div>
      </div>
    </div>
  )
}

