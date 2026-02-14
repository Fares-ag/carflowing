import { useState } from 'react'
import { AlertTriangle, Download, Trash2, X } from 'lucide-react'
import './PrivacySection.css'

export default function PrivacySection() {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  return (
    <div className="privacy-section">
      <h2 className="section-title">Privacy & Data</h2>

      <div className="privacy-content">
        <div className="privacy-item">
          <div className="privacy-info">
            <h4 className="privacy-item-title">Download Your Data</h4>
            <p className="privacy-item-description">Export all your account data in a portable format</p>
          </div>
          <button className="action-button">
            <Download size={14} />
            Export Data
          </button>
        </div>

        <div className="divider"></div>

        <div className="data-retention">
          <h4 className="group-title">Data Retention</h4>
          <ul className="retention-list">
            <li>Rental history: Kept for 7 years for tax and legal purposes</li>
            <li>Profile data: Kept until account deletion</li>
            <li>Communication logs: Kept for 2 years</li>
            <li>Payment information: Handled by secure payment processors</li>
          </ul>
        </div>

        <div className="divider"></div>

        <div className="danger-zone">
          <h4 className="group-title">Danger Zone</h4>
          <div className="danger-item">
            <div className="danger-info">
              <h5 className="danger-item-title">Delete Account</h5>
              <p className="danger-item-description">Permanently delete your account and all associated data</p>
            </div>
            <button 
              className="danger-button"
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 size={14} />
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setShowDeleteModal(false)}>
              <X size={14} />
            </button>
            <h2 className="modal-title">Delete Account</h2>
            <div className="modal-content">
              <div className="delete-alert">
                <AlertTriangle size={14} />
                <p>This action cannot be undone. All your data, rental history, and account information will be permanently deleted.</p>
              </div>
              <div className="delete-confirm">
                <label>Type "DELETE" to confirm</label>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="confirm-input"
                />
              </div>
              <div className="modal-actions">
                <button 
                  className="delete-confirm-button"
                  disabled={deleteConfirm !== 'DELETE'}
                >
                  Delete My Account
                </button>
                <button 
                  className="cancel-button"
                  onClick={() => {
                    setShowDeleteModal(false)
                    setDeleteConfirm('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

