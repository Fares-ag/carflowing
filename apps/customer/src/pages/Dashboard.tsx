import { Link } from 'react-router-dom'
import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { uploadAvatar } from '@carflow/shared'
import { listFavorites, listRentalsWithDetails } from '../services/customerService'
import { getProfileAvatar, getUserId, updateProfileAvatar } from '../services/authService'
import { useAuth } from '../contexts/AuthContext'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { toast } from '../hooks/useToast'
import { ArrowLeft, BadgeCheck, ClipboardList, CreditCard, Heart, Settings, Star, Car, Search } from 'lucide-react'
import './Dashboard.css'

export function Dashboard() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const { data: avatarUrl } = useQuery({
    queryKey: ['profile', 'avatar'],
    queryFn: getProfileAvatar,
  })

  const { data: rentalsData, isLoading: rentalsLoading, error: rentalsError } = useQuery({
    queryKey: ['rentals', 'details'],
    queryFn: () => listRentalsWithDetails({ pageSize: 50 }),
  })

  const { data: favoritesData, isLoading: favoritesLoading, error: favoritesError } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => listFavorites({ pageSize: 50 }),
  })

  const isLoading = rentalsLoading || favoritesLoading
  const error = rentalsError || favoritesError

  const items = rentalsData?.items ?? []
  const activeRentals = items.filter((r) => r.status === 'active' || r.status === 'reserved').length
  const totalRentals = items.length
  const favoriteCount = favoritesData?.items?.length ?? 0
  const activeList = items.filter((r) => r.status === 'active' || r.status === 'reserved')
  const first = activeList[0]
  const currentRental = first
    ? (() => {
        const start = new Date(first.startDate)
        const end = new Date(first.endDate)
        const now = new Date()
        const days = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
        return {
          car: first.vehicle?.name ?? 'Unknown vehicle',
          pickup: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          return: end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          remaining: `${days} days remaining`,
          total: first.totalAmount,
        }
      })()
    : null

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
                  disabled={uploadingAvatar}
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Star size={14} />
                  {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  onChange={async (event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (!file) return
                    setUploadingAvatar(true)
                    try {
                      const userId = await getUserId()
                      if (!userId) throw new Error('Not authenticated')
                      const url = await uploadAvatar(file, userId)
                      await updateProfileAvatar(url)
                      queryClient.invalidateQueries({ queryKey: ['profile', 'avatar'] })
                      toast.success('Profile photo updated.')
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Could not update photo.')
                    } finally {
                      setUploadingAvatar(false)
                    }
                  }}
                />
              </div>
              <div className="profile-info">
                <h1 className="profile-name">Welcome back, {session?.name ?? 'Customer'}!</h1>
                <p className="profile-description">Manage your rentals and account settings from your dashboard</p>
                <div className="profile-badges">
                {session?.email_confirmed_at && (
                  <span className="badge">
                    <BadgeCheck size={12} />
                    Verified Account
                  </span>
                )}
                </div>
              </div>
            </div>
          </div>

          {isLoading && (
            <div className="dashboard-loading">
              <p>Loading your dashboard...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="dashboard-error">
              <p>Something went wrong loading your data. Please try refreshing the page.</p>
            </div>
          )}

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
          {currentRental && (
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
                  <h4 className="rental-car-name">{currentRental.car}</h4>
                  <p className="rental-dates">Pickup: {currentRental.pickup} • Return: {currentRental.return}</p>
                  <div className="rental-remaining">
                    <span className="remaining-dot"></span>
                    <span>{currentRental.remaining}</span>
                  </div>
                </div>
                <div className="rental-price">
                  <div className="price-amount">QAR {currentRental.total.toLocaleString()}</div>
                  <div className="price-label">Total cost</div>
                </div>
              </div>
            </div>
          )}

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
    </div>
  )
}

