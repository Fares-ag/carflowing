import { computeRentalTotal, formatVehicleLocation, vehicleCategoryLabel, type Vehicle } from '@carflow/shared'
import { useQuery } from '@tanstack/react-query'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CarCard } from '../components/shared/CarCard'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../hooks/useToast'
import { addFavorite, listCatalogVehicles } from '../services/customerService'
import { BrowseFiltersPanel } from './BrowseFiltersPanel'
import {
  BROWSE_PAGE_SIZE,
  buildCatalogQueryParams,
} from './browseCatalogQuery'
import {
  countActiveBrowseFilters,
  DEFAULT_FILTER_STATE,
  type BrowseCar,
  type BrowseFilterState,
} from './browseFilters.config'
import './BrowseCarsPage.css'

const QUICK_CATEGORIES = ['All', 'Sedan', 'SUV', 'Electric'] as const

function mapVehicleToBrowseCar(vehicle: Vehicle): BrowseCar {
  return {
    id: vehicle.id,
    name: vehicle.name,
    type: vehicleCategoryLabel(vehicle.category),
    price: Math.round(computeRentalTotal(vehicle.pricePerDay, 1)),
    pricePeriod: 'month',
    seats: vehicle.seats,
    transmission: vehicle.transmission === 'manual' ? 'Manual' : 'Automatic',
    fuelType: vehicle.fuelType,
    isElectric: vehicle.fuelType === 'electric',
    make: vehicle.make,
    model: vehicle.model,
    mileage: vehicle.mileage,
    year: vehicle.year,
    image: vehicle.imageUrl ?? vehicle.imageUrls?.[0],
    location: formatVehicleLocation(vehicle),
    features: vehicle.features ?? [],
    rating: vehicle.averageRating ?? 0,
    reviewCount: vehicle.reviewCount ?? 0,
  }
}

export function BrowseCarsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const legacyRedirect = (location.state as { legacyRedirect?: string } | null)?.legacyRedirect
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)
  const [page, setPage] = useState(1)
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
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, filters])

  useEffect(() => {
    const next = searchParams.get('category')
    const prev = prevCategoryParam.current
    prevCategoryParam.current = next

    if (!next) {
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

  const catalogParams = useMemo(
    () => buildCatalogQueryParams(filters, debouncedSearch, page, BROWSE_PAGE_SIZE),
    [filters, debouncedSearch, page]
  )

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['catalog', 'browse', catalogParams],
    queryFn: () => listCatalogVehicles(catalogParams),
    placeholderData: (previous) => previous,
  })

  const cars = useMemo(() => (data?.items ?? []).map(mapVehicleToBrowseCar), [data?.items])
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / BROWSE_PAGE_SIZE))

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
    const params = new URLSearchParams()
    if (filters.startDate) params.set('start', filters.startDate)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    navigate(`/car/${car.id}${suffix}`)
  }

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
                <strong>{total}</strong>
                <span>car{total === 1 ? '' : 's'} available</span>
                {activeFilterCount > 0 && (
                  <span className="browse-results__filter-count">
                    · {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
                  </span>
                )}
                {isFetching && !isLoading && (
                  <span className="browse-results__filter-count"> · Updating…</span>
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
            ) : cars.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__title">No cars match your filters</p>
                <p className="empty-state__text">Try widening price, year, or clearing a few filters.</p>
                <button type="button" className="empty-state__btn" onClick={handleClearFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                <div className="browse-grid">
                  {cars.map((car) => (
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
                      location={car.location}
                      rating={car.rating}
                      reviews={car.reviewCount}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <nav className="browse-pagination" aria-label="Catalog pages">
                    <button
                      type="button"
                      className="browse-pagination__btn"
                      disabled={page <= 1 || isFetching}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Previous
                    </button>
                    <span className="browse-pagination__meta">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="browse-pagination__btn"
                      disabled={page >= totalPages || isFetching}
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    >
                      Next
                    </button>
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
