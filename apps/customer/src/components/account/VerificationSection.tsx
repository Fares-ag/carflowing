import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Car, Check, FileText, Mail, Phone, Smartphone, Upload } from 'lucide-react'
import { apiRequest, uploadCustomerDocument, type CustomerDocumentType } from '@carflow/shared'
import { getCustomerProfile, updateCustomerDocuments } from '../../services/customerService'
import { useAuth } from '../../contexts/AuthContext'
import { toast } from '../../hooks/useToast'
import './VerificationSection.css'

const MAX_FILE_BYTES = 10 * 1024 * 1024

export default function VerificationSection() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState<string | null>(null)
  const [emailVerified, setEmailVerified] = useState(false)
  const [profile, setProfile] = useState<{
    qid_document_path: string | null
    drivers_license_path: string | null
  } | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [uploadingDoc, setUploadingDoc] = useState<'qid' | 'drivers_license' | null>(null)
  const [documentError, setDocumentError] = useState('')

  const qidInputRef = useRef<HTMLInputElement>(null)
  const licenseInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingProfile(true)
      setDocumentError('')
      try {
        if (session) {
          setEmail(session.email ?? '')
          setEmailVerified(!!session.email_confirmed_at)
        }
        const full = await apiRequest<{ profile: { phone?: string | null } | null }>(
          '/customer/profile/full'
        )
        if (!cancelled) {
          setPhone(full.profile?.phone ?? null)
        }
        const docs = await getCustomerProfile()
        if (!cancelled) {
          setProfile(docs)
        }
      } catch {
        if (!cancelled) {
          setProfile(null)
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  const hasQid = !!profile?.qid_document_path
  const hasDriversLicense = !!profile?.drivers_license_path

  const handleDocumentUpload = async (type: CustomerDocumentType, file: File) => {
    setDocumentError('')
    if (file.size > MAX_FILE_BYTES) {
      const msg = 'File must be 10MB or smaller.'
      setDocumentError(msg)
      toast.error(msg)
      return
    }
    setUploadingDoc(type === 'qid' ? 'qid' : 'drivers_license')
    try {
      const userId = session?.userId
      if (!userId) throw new Error('Not authenticated')
      const path = await uploadCustomerDocument(file, userId, type)
      const updated = await updateCustomerDocuments(
        type === 'qid' ? { qid_document_path: path } : { drivers_license_path: path }
      )
      setProfile(updated)
      toast.success(type === 'qid' ? 'QID document uploaded' : "Driver's license uploaded")
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setDocumentError(msg)
      toast.error(msg)
    } finally {
      setUploadingDoc(null)
    }
  }

  const phoneDisplay = phone?.trim() ? phone : '—'
  const hasPhoneOnFile = !!phone?.trim()

  return (
    <div className="verification-section">
      <div className="verification-header">
        <h2 className="section-title">Identity Verification</h2>
        <p className="section-description">Verify your identity to unlock premium features and enhanced security</p>
      </div>

      <div className="verification-content">
        <div className="verification-item">
          <div className="verification-info">
            <div className="verification-icon">
              <Mail size={18} />
            </div>
            <div>
              <h4 className="verification-item-title">Email Address</h4>
              <p className="verification-item-value">{email || '—'}</p>
            </div>
          </div>
          <span className={`status-badge ${emailVerified ? 'verified' : 'pending'}`}>
            {emailVerified ? 'Verified' : 'Pending'}
          </span>
        </div>

        <div className="verification-item">
          <div className="verification-info">
            <div className="verification-icon">
              <Phone size={18} />
            </div>
            <div>
              <h4 className="verification-item-title">Phone Number</h4>
              <p className="verification-item-value">{phoneDisplay}</p>
            </div>
          </div>
          {hasPhoneOnFile ? (
            <span className="status-badge neutral">
              <Smartphone size={14} aria-hidden />
              Phone on file
            </span>
          ) : (
            <span className="status-badge pending">No phone on file</span>
          )}
        </div>
        <p className="verification-phone-note">Phone verification via SMS is not available in this release.</p>

        {documentError && (
          <div className="verification-alert">
            <AlertTriangle size={14} />
            <p>{documentError}</p>
          </div>
        )}

        <div className="verification-upload-section">
          <div className="upload-header">
            <label className="upload-label">
              Qatar ID (QID) <span className="required">*</span>
            </label>
            <span className={`upload-status ${hasQid ? 'uploaded' : ''}`}>
              {loadingProfile ? 'Loading…' : hasQid ? 'Uploaded' : 'Upload Required'}
            </span>
          </div>
          <div className="upload-area">
            {hasQid ? (
              <>
                <div className="upload-icon">
                  <Check size={20} className="verification-upload-check" />
                </div>
                <h4 className="upload-title">Qatar ID</h4>
                <p className="upload-hint">Document uploaded</p>
              </>
            ) : (
              <>
                <div className="upload-icon">
                  <FileText size={20} />
                </div>
                <h4 className="upload-title">Upload Your Qatar ID</h4>
                <p className="upload-hint">JPG, PNG or PDF (max. 10MB)</p>
                <input
                  ref={qidInputRef}
                  type="file"
                  className="verification-file-input"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  disabled={!!uploadingDoc}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) handleDocumentUpload('qid', file)
                  }}
                />
                <button
                  type="button"
                  className="upload-button"
                  disabled={!!uploadingDoc || loadingProfile}
                  onClick={() => qidInputRef.current?.click()}
                >
                  <Upload size={14} />
                  Choose File
                </button>
                {uploadingDoc === 'qid' && <span className="upload-loading">Uploading…</span>}
              </>
            )}
          </div>
        </div>

        <div className="verification-upload-section">
          <div className="upload-header">
            <label className="upload-label">
              Driving License <span className="required">*</span>
            </label>
            <span className={`upload-status ${hasDriversLicense ? 'uploaded' : ''}`}>
              {loadingProfile ? 'Loading…' : hasDriversLicense ? 'Uploaded' : 'Upload Required'}
            </span>
          </div>
          <div className="upload-area">
            {hasDriversLicense ? (
              <>
                <div className="upload-icon">
                  <Check size={20} className="verification-upload-check" />
                </div>
                <h4 className="upload-title">Driving license</h4>
                <p className="upload-hint">Document uploaded</p>
              </>
            ) : (
              <>
                <div className="upload-icon">
                  <Car size={20} />
                </div>
                <h4 className="upload-title">Upload Your Driving License</h4>
                <p className="upload-hint">JPG, PNG or PDF (max. 10MB)</p>
                <input
                  ref={licenseInputRef}
                  type="file"
                  className="verification-file-input"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  disabled={!!uploadingDoc}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) handleDocumentUpload('drivers_license', file)
                  }}
                />
                <button
                  type="button"
                  className="upload-button"
                  disabled={!!uploadingDoc || loadingProfile}
                  onClick={() => licenseInputRef.current?.click()}
                >
                  <Upload size={14} />
                  Choose File
                </button>
                {uploadingDoc === 'drivers_license' && <span className="upload-loading">Uploading…</span>}
              </>
            )}
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
