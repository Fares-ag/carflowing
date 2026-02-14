import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState, useRef } from 'react'
import { listFavorites, listRentals } from '../services/customerService'
import { getCurrentUser } from '../services/authService'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { InfoModal } from '../components/shared/InfoModal'
import { ArrowLeft, BadgeCheck, ClipboardList, CreditCard, Heart, Settings, Star, Car, Search } from 'lucide-react'
import './Dashboard.css'

export function Dashboard() {
  const [activeRentals, setActiveRentals] = useState(0)
  const [totalRentals, setTotalRentals] = useState(0)
  const [favoriteCount, setFavoriteCount] = useState(0)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [user, setUser] = useState<{ name: string } | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then((currentUser) => {
        if (!active) return
        setUser(currentUser ? { name: currentUser.name } : null)
      })
      .catch(() => {
        if (!active) return
        setUser(null)
      })
    listRentals({ pageSize: 50 }).then((data) => {
      setTotalRentals(data.items.length)
      setActiveRentals(data.items.filter(rental => rental.status === 'active').length)
    })
    listFavorites({ pageSize: 50 }).then((data) => setFavoriteCount(data.items.length))
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="dashboard-page">
      <Header />
      
      <div className="dashboard-container">
        <div className="dashboard-content">
          <Link to="/" className="back-button">
            <ArrowLeft size={14} />
            Back to Carflow
          </Link>

          {/* Profile Section */}
          <div className="profile-section">
            <div className="profile-card">
              <div className="profile-avatar-large">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" />
                ) : (
                  <div className="profile-placeholder">Profile</div>
                )}
                <button
                  className="change-photo-button"
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Star size={14} />
                  Change Photo
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    if (event.target.files?.length) {
                      const file = event.target.files[0]
                      setAvatarUrl(URL.createObjectURL(file))
                      setInfoModal({
                        title: 'Profile Updated',
                        message: 'Profile photo updated.',
                      })
                    }
                  }}
                />
              </div>
              <div className="profile-info">
                <h1 className="profile-name">Welcome back, {user?.name ?? 'Customer'}!</h1>
                <p className="profile-description">Manage your rentals and account settings from your dashboard</p>
                <div className="profile-badges">
                <span className="badge">
                  <Star size={12} />
                  Premium Member
                </span>
                <span className="badge">
                  <BadgeCheck size={12} />
                  Verified Account
                </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Section */}
          <div className="stats-section">
            <div className="stat-card">
              <div className="stat-content">
                <div className="stat-label">Active Rentals</div>
                <div className="stat-value">{activeRentals}</div>
              </div>
              <div className="stat-icon">
                <ClipboardList size={18} />
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <div className="stat-label">Total Rentals</div>
                <div className="stat-value">{totalRentals}</div>
              </div>
              <div className="stat-icon">
                <Car size={18} />
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <div className="stat-label">Favorite Vehicles</div>
                <div className="stat-value">{favoriteCount}</div>
              </div>
              <div className="stat-icon">
                <Heart size={18} />
              </div>
            </div>
          </div>

          {/* Current Rental */}
          <div className="current-rental-card">
            <div className="card-header">
              <div className="card-dot"></div>
              <h3 className="card-title">Current Rental</h3>
            </div>
            <div className="rental-content">
              <div className="rental-icon">
                <Car size={18} />
              </div>
              <div className="rental-details">
                <h4 className="rental-car-name">BMW X5 xDrive40i</h4>
                <p className="rental-dates">Pickup: Dec 15, 2024 • Return: Dec 22, 2024</p>
                <div className="rental-remaining">
                  <span className="remaining-dot"></span>
                  <span>5 days remaining</span>
                </div>
              </div>
              <div className="rental-price">
                <div className="price-amount">QAR 7,000</div>
                <div className="price-label">Total cost</div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="quick-actions-section">
            <h2 className="section-title">Quick Actions</h2>
            <div className="actions-grid">
              <Link to="/rentals" className="action-card">
              <div className="action-icon">
                <ClipboardList size={18} />
              </div>
                <h3 className="action-title">My Rentals</h3>
                <p className="action-description">View and manage your rentals</p>
              </Link>
              <Link to="/requests" className="action-card">
              <div className="action-icon">
                <ClipboardList size={18} />
              </div>
                <h3 className="action-title">My Requests</h3>
                <p className="action-description">Track rental requests</p>
              </Link>
              <Link to="/favorites" className="action-card">
              <div className="action-icon">
                <Heart size={18} />
              </div>
                <h3 className="action-title">Favorites</h3>
                <p className="action-description">Your saved vehicles</p>
              </Link>
              <Link to="/billing" className="action-card">
              <div className="action-icon">
                <CreditCard size={18} />
              </div>
                <h3 className="action-title">Subscription & Billing</h3>
                <p className="action-description">Manage your subscription and payments</p>
              </Link>
              <Link to="/settings" className="action-card">
              <div className="action-icon">
                <Settings size={18} />
              </div>
                <h3 className="action-title">Account Settings</h3>
                <p className="action-description">Manage your profile</p>
              </Link>
              <Link to="/browse" className="action-card">
              <div className="action-icon">
                <Search size={18} />
              </div>
                <h3 className="action-title">Browse Cars</h3>
                <p className="action-description">Find new vehicles</p>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
    </div>
  )
}

