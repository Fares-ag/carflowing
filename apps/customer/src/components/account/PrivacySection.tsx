import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Download, Trash2, X } from 'lucide-react'
import { supabase } from '@carflow/shared'
import { toast } from '../../hooks/useToast'
import './PrivacySection.css'

export default function PrivacySection() {
  const navigate = useNavigate()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleExportData = async () => {
    setExporting(true)
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()
      if (userError || !user) {
        toast.error(userError?.message ?? 'You must be signed in to export data.')
        return
      }

      const [profileRes, customerRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('customer_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      ])

      if (profileRes.error) {
        throw new Error(profileRes.error.message)
      }

      const payload = {
        exportedAt: new Date().toISOString(),
        profile: profileRes.data,
        customer_profile: customerRes.data ?? null,
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'carflow-data-export.json'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Your data export has been downloaded.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export data.')
    } finally {
      setExporting(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (deleteConfirm !== 'DELETE') return
    setDeleting(true)
    try {
      await supabase.auth.signOut()
      setShowDeleteModal(false)
      setDeleteConfirm('')
      toast.info('You have been signed out. Your account is deactivated from this session.')
      navigate('/')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="privacy-section">
      <h2 className="section-title">Privacy & Data</h2>

      <div className="privacy-content">
        <div className="privacy-item">
          <div className="privacy-info">
            <h4 className="privacy-item-title">Download Your Data</h4>
            <p className="privacy-item-description">Export all your account data in a portable format</p>
          </div>
          <button
            type="button"
            className="action-button"
            onClick={handleExportData}
            disabled={exporting}
          >
            <Download size={14} />
            {exporting ? 'Exporting…' : 'Export Data'}
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
              <p className="danger-item-description">
                Deactivate this session and sign out. Contact support for full data removal.
              </p>
            </div>
            <button type="button" className="danger-button" onClick={() => setShowDeleteModal(true)}>
              <Trash2 size={14} />
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="close-button"
              onClick={() => !deleting && setShowDeleteModal(false)}
              disabled={deleting}
            >
              <X size={14} />
            </button>
            <h2 className="modal-title">Delete Account</h2>
            <div className="modal-content">
              <div className="delete-alert">
                <AlertTriangle size={14} />
                <p>
                  Your account will be deactivated and you will be signed out. To permanently delete your data,
                  contact support@carflow.ai.
                </p>
              </div>
              <div className="delete-confirm">
                <label>Type &quot;DELETE&quot; to confirm</label>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="confirm-input"
                  disabled={deleting}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="delete-confirm-button"
                  disabled={deleteConfirm !== 'DELETE' || deleting}
                  onClick={handleDeleteConfirm}
                >
                  {deleting ? 'Signing out…' : 'Deactivate & Sign Out'}
                </button>
                <button
                  type="button"
                  className="cancel-button"
                  disabled={deleting}
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
