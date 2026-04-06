import { useEffect, useRef, useState } from 'react'
import { Image, Pencil } from 'lucide-react'
import { uploadAvatar, supabase } from '@carflow/shared'
import { getProfileAvatar, getUserId, updateProfileAvatar } from '../../services/authService'
import { useAuth } from '../../contexts/AuthContext'
import './ProfileSection.css'

export default function ProfileSection() {
  const { session } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
  })

  useEffect(() => {
    if (!session) {
      setAvatarUrl(null)
      setFormData({ fullName: '', email: '', phone: '' })
      return
    }

    setFormData({
      fullName: session.name || '',
      email: session.email || '',
      phone: '',
    })

    getProfileAvatar().then(setAvatarUrl).catch((err) => console.error('Failed to load avatar:', err))
    supabase
      .from('profiles')
      .select('phone')
      .eq('id', session.userId)
      .maybeSingle()
      .then(({ data }) => {
        setFormData((prev) => ({ ...prev, phone: data?.phone || '' }))
      })
      .catch((err) => console.error('Failed to load phone:', err))
  }, [session?.userId, session?.name, session?.email])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <div className="profile-section">
      <div className="section-header">
        <h2 className="section-title">Profile Information</h2>
        <button className="edit-button" onClick={() => setIsEditing(!isEditing)}>
          <Pencil size={14} />
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      <div className="section-content">
        <div className="profile-photo-section">
          <div className="profile-photo">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" />
            ) : (
              <div className="profile-placeholder">Profile</div>
            )}
          </div>
          <div className="photo-actions">
            <button
              className="change-photo-button"
              disabled={!isEditing || uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Image size={14} />
              Change Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                setAvatarError(null)
                setUploading(true)
                try {
                  const userId = await getUserId()
                  if (!userId) throw new Error('Not authenticated')
                  const url = await uploadAvatar(file, userId)
                  await updateProfileAvatar(url)
                  setAvatarUrl(url)
                } catch (err) {
                  setAvatarError(err instanceof Error ? err.message : 'Upload failed')
                } finally {
                  setUploading(false)
                }
              }}
            />
            {avatarError && <p className="photo-error">{avatarError}</p>}
            <p className="photo-hint">
              {uploading ? 'Uploading...' : 'JPG, PNG, GIF or WebP. Max size 2MB.'}
            </p>
            {!isEditing && (
              <p className="edit-hint">Enable edit mode to change photo</p>
            )}
          </div>
        </div>

        <div className="divider"></div>

        <div className="form-fields">
          <div className="form-row">
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                disabled={!isEditing}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                disabled
                className="form-input"
                aria-describedby="profile-email-hint"
              />
              <p id="profile-email-hint" className="field-readonly-note">
                Email changes require verification — contact support.
              </p>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                disabled={!isEditing}
                className="form-input"
              />
            </div>
          </div>

          {isEditing && (
            <div className="form-actions">
              {saveError && <p className="photo-error">{saveError}</p>}
              <button
                className="save-button"
                disabled={saving}
                onClick={async () => {
                  setSaveError(null)
                  setSaving(true)
                  try {
                    const userId = await getUserId()
                    if (!userId) throw new Error('Not authenticated')
                    const { error } = await supabase
                      .from('profiles')
                      .update({
                        name: formData.fullName.trim(),
                        phone: formData.phone.trim() || null,
                      })
                      .eq('id', userId)
                    if (error) throw new Error(error.message)
                    setIsEditing(false)
                  } catch (err) {
                    setSaveError(err instanceof Error ? err.message : 'Failed to save')
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
