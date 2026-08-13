import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { computeRentalTotal, vehicleCategoryLabel } from '@carflow/shared'
import { addFavorite, listCatalogVehicles } from '../services/customerService'
import { toast } from '../hooks/useToast'
import { useAuth } from '../contexts/AuthContext'
import { CarCard } from '../components/shared/CarCard'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BrowseFiltersPanel } from './BrowseFiltersPanel'
import {
  applyBrowseFilters,
  countActiveBrowseFilters,
  DEFAULT_FILTER_STATE,
  type BrowseCar,
  type BrowseFilterState,
} from './browseFilters.config'
import './BrowseCarsPage.css'

const QUICK_CATEGORIES = ['All', 'Sedan', 'SUV', 'Electric'] as const

export function BrowseCarsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const legacyRedirect = (location.state as { legacyRedirect?: string } | null)?.legacyRedirect
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalog', 'browse', 20],
    queryFn: () => listCatalogVehicles({ pageSize: 20 }),
  })
  const vehicles = data?.items ?? []
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '')
  const [filters, setFilters] = useState<BrowseFilterState>(() => {
    const categoryParam = searchParams.get('category')
    if (categoryParam === 'Electric') {
      return { ...DEFAULT_FILTER_STATE, fuelTypes: ['electric'], categories: [] }
    }
    if (categoryParam) {
      return { ...DEFAULT_FILTER_STATE, categories: [categoryParam] }
    }
    return { ...DEFAULT_FILTER_STATE }
  })
  const [showFilters, setShowFilters] = useState(true)
  const prevCategoryParam = useRef<string | null>(searchParams.get('category'))

  useEffect(() => {
    const next = searchParams.get('category')
    const prev = prevCategoryParam.current
    prevCategoryParam.current = next

    if (!next) {
      // Only clear when the URL category was removed (e.g. All cars / Clear),
      // not on every /browse visit — that would wipe sidebar fuel picks.
      if (prev) {
        setFilters((current) => ({ ...current, categories: [], fuelTypes: [] }))
      }
      return
    }
    if (next === 'Electric') {
      setFilters((current) => ({ ...current, fuelTypes: ['electric'], categories: [] }))
      return
    }
    setFilters((current) => ({ ...current, categories: [next], fuelTypes: [] }))
  }, [searchParams])

  const syncCategoryParam = (category: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (category) next.set('category', category)
    else next.delete('category')
    setSearchParams(next, { replace: true })
  }

  const handleFavorite = (vehicleId: string) => {
    if (!session) {
      navigate(`/login?redirect=${encodeURIComponent('/browse')}`)
      return
    }
    addFavorite(vehicleId)
      .then(() => toast.success('Saved to your account.'))
      .catch(() => toast.error('Failed to save car.'))
  }

  const handleConfigure = (car: { id: string }) => {
    navigate(`/car/${car.id}`)
  }

  const cars = useMemo<BrowseCar[]>(() => {
    return vehicles.map((vehicle) => {
      const transmissionLabel = vehicle.transmission === 'manual' ? 'Manual' : 'Automatic'

      return {
        id: vehicle.id,
        name: vehicle.name,
        type: vehicleCategoryLabel(vehicle.category),
        price: Math.round(computeRentalTotal(vehicle.pricePerDay, 1)),
        pricePeriod: 'month' as const,
        seats: vehicle.seats,
        transmission: transmissionLabel,
        fuelType: vehicle.fuelType,
        isElectric: vehicle.fuelType === 'electric',
        make: vehicle.make,
        model: vehicle.model,
        mileage: vehicle.mileage,
        year: vehicle.year,
        image: vehicle.imageUrl,
        features: [],
        rating: 0,
      }
    })
  }, [vehicles])

  const filteredCars = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const searched = query
      ? cars.filter(
          (car) =>
            car.name.toLowerCase().includes(query) ||
            car.make.toLowerCase().includes(query) ||
            car.model.toLowerCase().includes(query)
        )
      : cars
    return applyBrowseFilters(searched, filters)
  }, [cars, searchQuery, filters])

  const handleClearFilters = () => {
    setFilters({ ...DEFAULT_FILTER_STATE })
    setSearchQuery('')
    syncCategoryParam(null)
  }

  const activeQuick =
    filters.fuelTypes.length === 1 &&
    filters.fuelTypes[0] === 'electric' &&
    filters.categories.length === 0
      ? 'Electric'
      : filters.categories.length === 1 && filters.fuelTypes.length === 0
        ? filters.categories[0]
        : filters.categories.length === 0 && filters.fuelTypes.length === 0
          ? 'All'
          : null

  const setQuickCategory = (value: (typeof QUICK_CATEGORIES)[number]) => {
    if (value === 'All') {
      setFilters((prev) => ({ ...prev, categories: [], fuelTypes: [] }))
      syncCategoryParam(null)
      return
    }
    if (value === 'Electric') {
      setFilters((prev) => ({ ...prev, fuelTypes: ['electric'], categories: [] }))
      syncCategoryParam('Electric')
      return
    }
    setFilters((prev) => ({ ...prev, categories: [value], fuelTypes: [] }))
    syncCategoryParam(value)
  }

  const activeFilterCount = countActiveBrowseFilters(filters)

  return (
    <div className="browse-cars-page">
      <Header />

      {legacyRedirect && (
        <div className="browse-legacy-banner" role="status">
          Booking is now on each car&apos;s page — pick a car and tap Book.
        </div>
      )}

      <section className="browse-banner">
        <div className="browse-banner__inner">
          <div className="browse-banner__title">
            <span className="browse-pill">Our fleet</span>
            <h1>Browse cars</h1>
            <p>Find the right subscription — filter by type, budget, or brand.</p>
          </div>

          <label className="browse-banner__search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by brand, model, or name..."
              aria-label="Search cars"
            />
            {searchQuery && (
              <button
                type="button"
                className="browse-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </label>

          <div className="browse-quick" role="tablist" aria-label="Quick categories">
            {QUICK_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={activeQuick === cat}
                className={`browse-quick__chip ${activeQuick === cat ? 'is-active' : ''}`}
                onClick={() => setQuickCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="browse-content">
        <div
          className={`browse-content__inner${showFilters ? '' : ' browse-content__inner--no-filters'}`}
        >
          {showFilters && (
            <BrowseFiltersPanel
              state={filters}
              onChange={setFilters}
              onClear={handleClearFilters}
            />
          )}

          <div className="browse-results">
            <div className="browse-results__header">
              <div className="browse-results__count">
                <strong>{filteredCars.length}</strong>
                <span>car{filteredCars.length === 1 ? '' : 's'} available</span>
                {activeFilterCount > 0 && (
                  <span className="browse-results__filter-count">
                    · {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <button
                className={`filters-toggle ${showFilters ? 'is-active' : ''}`}
                type="button"
                onClick={() => setShowFilters((value) => !value)}
              >
                <SlidersHorizontal size={14} aria-hidden />
                {showFilters ? 'Hide filters' : 'Show filters'}
              </button>
            </div>

            {isLoading ? (
              <div className="empty-state">
                <p className="empty-state__title">Loading vehicles…</p>
                <p className="empty-state__text">Pulling the latest cars from our catalog.</p>
              </div>
            ) : isError ? (
              <div className="empty-state empty-state--error">
                <p className="empty-state__title">Couldn&apos;t load vehicles</p>
                <p className="empty-state__text">Please refresh the page and try again.</p>
              </div>
            ) : filteredCars.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__title">No cars match your filters</p>
                <p className="empty-state__text">Try widening price, year, or clearing a few filters.</p>
                <button type="button" className="empty-state__btn" onClick={handleClearFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="browse-grid">
                {filteredCars.map((car) => (
                  <CarCard
                    key={car.id}
                    id={car.id}
                    name={car.name}
                    type={car.type}
                    price={car.price}
                    seats={car.seats}
                    transmission={car.transmission}
                    fuelType={car.fuelType}
                    image={car.image}
                    isElectric={car.isElectric}
                    onConfigure={() => handleConfigure(car)}
                    onFavorite={session ? () => handleFavorite(car.id) : undefined}
                    pricePeriod={car.pricePeriod}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
