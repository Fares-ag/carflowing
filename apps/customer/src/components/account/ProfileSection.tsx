import { useRef, useState } from 'react'
import { Image, Pencil } from 'lucide-react'
import './ProfileSection.css'

export default function ProfileSection() {
  const [isEditing, setIsEditing] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    fullName: 'Ahmed Al-Mahmoud',
    email: 'lkjjh@gmail.com',
    phone: '+974 5555 1234',
    dateOfBirth: '',
    address: 'West Bay, Doha, Qatar',
    city: 'Doha',
    country: 'Qatar',
    bio: 'Regular car rental customer who loves exploring Qatar',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
              disabled={!isEditing}
              onClick={() => fileInputRef.current?.click()}
            >
              <Image size={14} />
              Change Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                if (event.target.files?.length) {
                  const file = event.target.files[0]
                  setAvatarUrl(URL.createObjectURL(file))
                }
              }}
            />
            <p className="photo-hint">JPG, PNG, GIF or WebP. Max size 2MB.</p>
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
                onChange={handleChange}
                disabled={!isEditing}
                className="form-input"
              />
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
            <div className="form-group">
              <label>Date of Birth</label>
              <input
                type="date"
                name="dateOfBirth"
                value={formData.dateOfBirth}
                onChange={handleChange}
                disabled={!isEditing}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group full-width">
            <label>Address</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              disabled={!isEditing}
              className="form-input"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>City</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                disabled={!isEditing}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Country</label>
              <select
                name="country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                disabled={!isEditing}
                className="form-input"
              >
                <option value="Qatar">Qatar</option>
                <option value="UAE">UAE</option>
                <option value="Saudi Arabia">Saudi Arabia</option>
              </select>
            </div>
          </div>

          <div className="form-group full-width">
            <label>Bio</label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              disabled={!isEditing}
              className="form-textarea"
              rows={3}
            />
          </div>

          {isEditing && (
            <div className="form-actions">
              <button className="save-button" onClick={() => setIsEditing(false)}>
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

