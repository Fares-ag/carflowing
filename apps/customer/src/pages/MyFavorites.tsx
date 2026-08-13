import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { vehicleCategoryLabel } from '@carflow/shared'
import { clearFavorites, listFavoriteVehicles, removeFavorite } from '../services/customerService'
import { toast } from '../hooks/useToast'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { CarCard } from '../components/shared/CarCard'
import { ArrowLeft, ChevronDown, Grid, Heart, List, Search } from 'lucide-react'
import './MyFavorites.css'

function unavailableLabel(reason: string | null | undefined): string | undefined {
  if (reason === 'pending_booking') return 'Pending your booking'
  if (reason === 'unavailable') return 'Currently unavailable'
  if (reason === 'removed') return 'No longer listed'
  return undefined
}

export function MyFavorites() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid')

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['favorites', 'vehicles'],
    queryFn: listFavoriteVehicles,
  })
  const favoriteItems = data?.items ?? []

  const removeMutation = useMutation({
    mutationFn: removeFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      toast.success('Removed from favorites.')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to remove'),
  })

  const favoriteCards = useMemo(() => {
    return favoriteItems.map((item) => {
      const vehicle = item.vehicle
      const badge = unavailableLabel(item.unavailableReason)
      return {
        id: item.favorite.id,
        vehicleId: item.favorite.vehicleId,
        name: vehicle ? vehicle.name : 'Saved vehicle',
        make: vehicle?.make ?? '',
        type: vehicle ? vehicleCategoryLabel(vehicle.category) : 'Other',
        price: vehicle ? Math.round(vehicle.pricePerDay) : 0,
        seats: vehicle?.seats ?? 5,
        transmission: vehicle?.transmission === 'manual' ? 'Manual' : 'Automatic',
        fuelType: vehicle?.fuelType ?? 'gas',
        image: vehicle?.imageUrl,
        isElectric: vehicle?.fuelType === 'electric',
        pricePeriod: 'day' as const,
        favoriteId: item.favorite.id,
        unavailable: Boolean(item.unavailableReason),
        unavailableLabel: badge,
      }
    })
  }, [favoriteItems])

  const filteredCards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const normalizedCategory = categoryFilter.toLowerCase()
    let list = favoriteCards.filter(card => {
      const matchesSearch = !query || card.name.toLowerCase().includes(query)
      const matchesCategory = normalizedCategory === 'all' || card.type.toLowerCase() === normalizedCategory
      return matchesSearch && matchesCategory
    })

    list = [...list].sort((a, b) => {
      if (sortBy === 'price') return b.price - a.price
      return a.name.localeCompare(b.name)
    })

    return list
  }, [favoriteCards, searchQuery, categoryFilter, sortBy])

  const categoryOptions = useMemo(() => {
    const values = Array.from(new Set(favoriteCards.map(card => card.type)))
    return ['all', ...values]
  }, [favoriteCards])

  const isEmpty = filteredCards.length === 0

  return (
    <div className="my-favorites-page">
      <Header />
      
      <div className="favorites-container">
        <div className="favorites-content">
          <div className="page-header">
            <Link to="/browse" className="back-button">
              <ArrowLeft size={14} />
              Back to Dashboard
            </Link>
            <Link to="/browse" className="browse-button">
              <ArrowLeft size={14} />
              Browse Cars
            </Link>
          </div>

          <div className="favorites-section">
            <div className="section-header">
              <div>
                <h1 className="page-title">My Favorites</h1>
                <p className="page-description">
                  {isEmpty ? '0 saved vehicles' : `${favoriteItems.length} saved vehicle${favoriteItems.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              {!isEmpty && (
                <div className="header-actions">
                  <Link to="/browse" className="action-button">
                    <ArrowLeft size={14} />
                    Browse More Cars
                  </Link>
                  <button
                    className="action-button secondary"
                    type="button"
                    onClick={() => {
                      clearFavorites().then(() => {
                        queryClient.invalidateQueries({ queryKey: ['favorites'] })
                        toast.success('All favorites cleared.')
                      })
                    }}
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            <div className="filters-section">
              <div className="search-input-wrapper">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search by car name..."
                  className="search-input"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <div className="filter-controls">
                <label className="filter-button">
                  <select
                    aria-label="Filter by category"
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                  >
                    {categoryOptions.map(option => (
                      <option key={option} value={option}>
                        {option === 'all' ? 'All Categories' : option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <label className="filter-button">
                  <select
                    aria-label="Sort favorites"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                  >
                    <option value="name">Name</option>
                    <option value="price">Price</option>
                  </select>
                  <ChevronDown size={14} />
                </label>
                <div className="view-toggle">
                  <button
                    className={`view-button ${viewMode === 'list' ? 'active' : ''}`}
                    type="button"
                    onClick={() => setViewMode('list')}
                  >
                    <List size={14} />
                  </button>
                  <button
                    className={`view-button ${viewMode === 'grid' ? 'active' : ''}`}
                    type="button"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid size={14} />
                  </button>
                </div>
              </div>
            </div>

            {isLoading && (
              <div className="favorites-loading">
                <p>Loading favorites...</p>
              </div>
            )}

            {queryError && !isLoading && (
              <div className="favorites-error">
                <p>Failed to load favorites. Please try again later.</p>
              </div>
            )}

            {!isLoading && !queryError && isEmpty ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Heart size={56} />
                </div>
                <h3 className="empty-title">No favorites yet</h3>
                <p className="empty-description">Start browsing cars and save your favorites here</p>
                <Link to="/browse" className="browse-button">
                  <ArrowLeft size={14} />
                  Browse Cars
                </Link>
              </div>
            ) : !isLoading && !queryError ? (
              <div className={`favorites-grid ${viewMode === 'list' ? 'favorites-grid--list' : ''}`}>
                {filteredCards.map((car) => {
                  const { favoriteId, vehicleId, make, unavailable, unavailableLabel: badge, ...cardProps } = car
                  return (
                    <div key={car.id} className="favorite-card-wrapper">
                      {badge && <span className="favorite-unavailable-badge">{badge}</span>}
                      <CarCard
                        {...cardProps}
                        onRemove={() => removeMutation.mutate(favoriteId)}
                        onFavorite={() => removeMutation.mutate(favoriteId)}
                        onConfigure={() => {
                          if (unavailable) {
                            toast.info(badge ?? 'This vehicle is not available to configure right now.')
                            return
                          }
                          navigate(`/car/${vehicleId}`)
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
