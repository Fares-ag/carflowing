import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Favorite, Vehicle } from '@carflow/shared'
import { clearFavorites, listCatalogVehicles, listFavorites, removeFavorite } from '../services/customerService'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { CarCard } from '../components/shared/CarCard'
import { ArrowLeft, ChevronDown, Grid, Heart, List, Search } from 'lucide-react'
import './MyFavorites.css'

export function MyFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid')

  const refreshFavorites = () => {
    Promise.all([listFavorites({ pageSize: 12 }), listCatalogVehicles({ pageSize: 12 })]).then(
      ([favoriteData, vehicleData]) => {
        setFavorites(favoriteData.items)
        setVehicles(vehicleData.items)
      }
    )
  }

  useEffect(() => {
    refreshFavorites()
  }, [])

  const favoriteCards = useMemo(() => {
    const vehicleMap = new Map(vehicles.map(vehicle => [vehicle.id, vehicle]))
    return favorites.map((favorite, index) => {
      const vehicle = vehicleMap.get(favorite.vehicleId)
      return {
        id: favorite.id,
        name: vehicle ? vehicle.name : `Vehicle ${index + 1}`,
        type: vehicle?.category ?? 'Sedan',
        price: vehicle ? Math.round(vehicle.pricePerDay / 10) : 30,
        rating: 4.6 + index * 0.1,
        reviews: 30 + index * 4,
        seats: vehicle?.seats ?? 5,
        transmission: vehicle?.transmission === 'manual' ? 'Manual' : 'Automatic',
        fuelType: vehicle?.fuelType ?? 'gas',
        location: 'Doha, Qatar',
        isElectric: vehicle?.fuelType === 'electric',
        pricePeriod: 'day',
        favoriteId: favorite.id,
      }
    })
  }, [favorites, vehicles])

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
      if (sortBy === 'rating') return b.rating - a.rating
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
            <Link to="/dashboard" className="back-button">
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
                  {isEmpty ? '0 saved vehicles' : `${favorites.length} saved vehicle${favorites.length !== 1 ? 's' : ''}`}
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
                      clearFavorites().then(() => refreshFavorites())
                    }}
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {/* Search and Filters */}
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
                    <option value="rating">Rating</option>
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

            {/* Empty State */}
            {isEmpty ? (
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
            ) : (
              <div className={`favorites-grid ${viewMode === 'list' ? 'favorites-grid--list' : ''}`}>
                {filteredCards.map((car) => {
                  const { favoriteId, ...cardProps } = car
                  return (
                    <div key={car.id} className="favorite-card-wrapper">
                      <CarCard
                        {...cardProps}
                        onRemove={() => {
                          removeFavorite(favoriteId).then(() => refreshFavorites())
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}

