import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CarflowLogo } from '@carflow/shared'
import { addFavorite, listCatalogVehicles } from '../services/customerService'
import { toast } from '../hooks/useToast'
import { useCartStore } from '../stores/cartStore'
import { CarCard } from '../components/shared/CarCard'
import { Footer } from '../components/shared/Footer'
import { InfoModal } from '../components/shared/InfoModal'
import { ChevronDown, Menu, Search, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import './BrowseCarsPage.css'

const BRAND_OPTIONS = ['BMW', 'Mercedes', 'Tesla', 'Toyota', 'Honda', 'Porsche']
const CATEGORY_OPTIONS = ['Luxury', 'Electric', 'Economy', 'Sedan', 'Sports', 'SUV']
const FUEL_OPTIONS = ['petrol', 'electric', 'hybrid', 'diesel']
const TRANSMISSION_OPTIONS = ['Automatic', 'Manual', 'CVT']
const SEAT_OPTIONS = [2, 4, 5, 7]

const SORT_OPTIONS = ['Recommended', 'Price: Low to High', 'Price: High to Low', 'Newest']

export function BrowseCarsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setVehicle = useCartStore((s) => s.setVehicle)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalog', 'browse', 20],
    queryFn: () => listCatalogVehicles({ pageSize: 20 }),
  })
  const vehicles = data?.items ?? []
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '')
  const [sortBy, setSortBy] = useState(SORT_OPTIONS[0])
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedFuelTypes, setSelectedFuelTypes] = useState<string[]>([])
  const [selectedTransmissions, setSelectedTransmissions] = useState<string[]>([])
  const [selectedSeats, setSelectedSeats] = useState<number[]>([])
  const [priceMin, setPriceMin] = useState(0)
  const [priceMax, setPriceMax] = useState(5000)
  const [maxMileage, setMaxMileage] = useState(50000)
  const [yearMin, setYearMin] = useState(2020)
  const [yearMax, setYearMax] = useState(2024)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showFilters, setShowFilters] = useState(true)

  const handleFavorite = (vehicleId: string) => {
    addFavorite(vehicleId)
      .then(() => toast.success('Saved to favorites.'))
      .catch(() => toast.error('Failed to save favorite.'))
  }

  const handleConfigure = (car: {
    id: string
    name: string
    make: string
    fuelType: string
    transmission: string
    seats: number
    image?: string
    price: number
  }) => {
    setVehicle({
      id: car.id,
      name: car.name,
      make: car.make,
      fuelType: car.fuelType,
      transmission: car.transmission,
      seats: car.seats,
      image: car.image,
      pricePerDay: Math.round(car.price / 6),
    })
    navigate('/cart')
  }

  const cars = useMemo(() => {
    return vehicles.map((vehicle) => {
      const categoryLabel =
        vehicle.category === 'suv'
          ? 'SUV'
          : vehicle.category === 'ev'
            ? 'Electric'
            : vehicle.category === 'luxury'
              ? 'Luxury'
              : 'Sedan'
      const transmissionLabel = vehicle.transmission === 'manual' ? 'Manual' : 'Automatic'

      return {
        id: vehicle.id,
        name: vehicle.name,
        type: categoryLabel,
        price: Math.round(vehicle.pricePerDay * 6),
        seats: vehicle.seats,
        transmission: transmissionLabel,
        fuelType: vehicle.fuelType,
        isElectric: vehicle.fuelType === 'electric',
        make: vehicle.make,
        model: vehicle.model,
        mileage: vehicle.mileage,
        year: vehicle.year,
        image: vehicle.imageUrl,
      }
    })
  }, [vehicles])

  const filteredCars = useMemo(() => {
    return cars
      .filter((car) => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return true
        return (
          car.name.toLowerCase().includes(query) ||
          car.make.toLowerCase().includes(query) ||
          car.model.toLowerCase().includes(query)
        )
      })
      .filter((car) => {
        if (selectedBrands.length === 0) return true
        return selectedBrands.includes(car.make)
      })
      .filter((car) => {
        if (selectedCategories.length === 0) return true
        return selectedCategories.includes(car.type)
      })
      .filter((car) => {
        if (selectedFuelTypes.length === 0) return true
        const fuelLabel = car.fuelType === 'gas' ? 'petrol' : car.fuelType
        return selectedFuelTypes.includes(fuelLabel)
      })
      .filter((car) => {
        if (selectedTransmissions.length === 0) return true
        return selectedTransmissions.includes(car.transmission)
      })
      .filter((car) => {
        if (selectedSeats.length === 0) return true
        return selectedSeats.includes(car.seats)
      })
      .filter((car) => car.price >= priceMin && car.price <= priceMax)
      .filter((car) => car.mileage <= maxMileage)
      .filter((car) => car.year >= yearMin && car.year <= yearMax)
      .sort((a, b) => {
        if (sortBy === 'Price: Low to High') return a.price - b.price
        if (sortBy === 'Price: High to Low') return b.price - a.price
        if (sortBy === 'Newest') return b.year - a.year
        return 0
      })
  }, [
    cars,
    searchQuery,
    selectedBrands,
    selectedCategories,
    selectedFuelTypes,
    selectedTransmissions,
    selectedSeats,
    priceMin,
    priceMax,
    maxMileage,
    yearMin,
    yearMax,
    sortBy,
  ])

  const toggleValue = <T,>(list: T[], value: T, setter: (next: T[]) => void) => {
    if (list.includes(value)) {
      setter(list.filter((item) => item !== value))
    } else {
      setter([...list, value])
    }
  }

  const handleClearFilters = () => {
    setSelectedBrands([])
    setSelectedCategories([])
    setSelectedFuelTypes([])
    setSelectedTransmissions([])
    setSelectedSeats([])
    setPriceMin(0)
    setPriceMax(5000)
    setMaxMileage(50000)
    setYearMin(2020)
    setYearMax(2024)
  }

  return (
    <div className="browse-cars-page">
      <header className="browse-nav">
        <div className="browse-nav__inner">
          <Link to="/" className="browse-nav__logo">
            <img src={CarflowLogo} alt="Carflow" />
          </Link>
          <nav className="browse-nav__links">
            <Link to="/browse" className="browse-nav__link">Browse Cars</Link>
            <Link to="/contact" className="browse-nav__link">Contact</Link>
            <Link to="/faqs" className="browse-nav__link">FAQ's</Link>
          </nav>
          <div className="browse-nav__actions">
            <button
              className="browse-nav__menu"
              type="button"
              aria-label="Open menu"
              onClick={() => setIsMenuOpen(true)}
            >
              <Menu size={16} />
            </button>
            <Link to="/login" className="browse-nav__signin">Sign In</Link>
          </div>
        </div>
      </header>

      {isMenuOpen && (
        <div className="browse-menu">
          <div className="browse-menu__backdrop" onClick={() => setIsMenuOpen(false)} />
          <div className="browse-menu__panel">
            <button className="browse-menu__close" type="button" onClick={() => setIsMenuOpen(false)}>
              Close
            </button>
            <Link to="/browse" className="browse-menu__link" onClick={() => setIsMenuOpen(false)}>
              Browse Cars
            </Link>
            <Link to="/contact" className="browse-menu__link" onClick={() => setIsMenuOpen(false)}>
              Contact
            </Link>
            <Link to="/faqs" className="browse-menu__link" onClick={() => setIsMenuOpen(false)}>
              FAQ's
            </Link>
            <Link to="/login" className="browse-menu__cta" onClick={() => setIsMenuOpen(false)}>
              Sign In
            </Link>
          </div>
        </div>
      )}

      <section className="browse-banner">
        <div className="browse-banner__inner">
          <div className="browse-banner__title">
            <h1>Browse Our Fleet</h1>
            <p>Find the perfect car for your needs</p>
          </div>
          <div className="browse-banner__search">
            <Search size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by brand, model, or name..."
            />
          </div>
        </div>
      </section>

      <section className="browse-content">
        <div
          className={`browse-content__inner${showFilters ? '' : ' browse-content__inner--no-filters'}`}
        >
          <aside className={`browse-filters ${showFilters ? '' : 'hidden'}`}>
            <div className="filter-section">
              <label>Sort By</label>
              <button type="button" className="filter-select">
                <span>{sortBy}</span>
                <ChevronDown size={14} />
              </button>
              <div className="filter-select__menu">
                {SORT_OPTIONS.map((option) => (
                  <button key={option} type="button" onClick={() => setSortBy(option)}>
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-divider" />

            <div className="filter-section">
              <label>Price Range: QAR {priceMin} - QAR {priceMax}</label>
              <div className="range-group">
                <input
                  type="range"
                  min={0}
                  max={5000}
                  value={priceMin}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    setPriceMin(Math.min(next, priceMax))
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={5000}
                  value={priceMax}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    setPriceMax(Math.max(next, priceMin))
                  }}
                />
              </div>
            </div>

            <div className="filter-divider" />

            <div className="filter-section">
              <label>Brands</label>
              <div className="filter-list">
                {BRAND_OPTIONS.map((brand) => (
                  <label key={brand} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedBrands.includes(brand)}
                      onChange={() => toggleValue(selectedBrands, brand, setSelectedBrands)}
                    />
                    <span>{brand}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-divider" />

            <div className="filter-section">
              <label>Categories</label>
              <div className="filter-list">
                {CATEGORY_OPTIONS.map((category) => (
                  <label key={category} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category)}
                      onChange={() => toggleValue(selectedCategories, category, setSelectedCategories)}
                    />
                    <span>{category}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-divider" />

            <div className="filter-section">
              <label>Fuel Type</label>
              <div className="filter-list">
                {FUEL_OPTIONS.map((fuel) => (
                  <label key={fuel} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedFuelTypes.includes(fuel)}
                      onChange={() => toggleValue(selectedFuelTypes, fuel, setSelectedFuelTypes)}
                    />
                    <span>{fuel}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-divider" />

            <div className="filter-section">
              <label>Transmission</label>
              <div className="filter-list">
                {TRANSMISSION_OPTIONS.map((transmission) => (
                  <label key={transmission} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedTransmissions.includes(transmission)}
                      onChange={() =>
                        toggleValue(selectedTransmissions, transmission, setSelectedTransmissions)
                      }
                    />
                    <span>{transmission}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-divider" />

            <div className="filter-section">
              <label>Number of Seats</label>
              <div className="seat-grid">
                {SEAT_OPTIONS.map((seat) => (
                  <button
                    key={seat}
                    type="button"
                    className={`seat-option ${selectedSeats.includes(seat) ? 'active' : ''}`}
                    onClick={() => toggleValue(selectedSeats, seat, setSelectedSeats)}
                  >
                    {seat}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-divider" />

            <div className="filter-section">
              <label>Maximum Mileage: {maxMileage.toLocaleString()} km</label>
              <input
                type="range"
                min={10000}
                max={50000}
                step={1000}
                value={maxMileage}
                onChange={(event) => setMaxMileage(Number(event.target.value))}
              />
            </div>

            <div className="filter-divider" />

            <div className="filter-section">
              <label>Year Range: {yearMin} - {yearMax}</label>
              <div className="range-group">
                <input
                  type="range"
                  min={2015}
                  max={2024}
                  value={yearMin}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    setYearMin(Math.min(next, yearMax))
                  }}
                />
                <input
                  type="range"
                  min={2015}
                  max={2024}
                  value={yearMax}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    setYearMax(Math.max(next, yearMin))
                  }}
                />
              </div>
            </div>

            <div className="filter-divider" />

            <button type="button" className="clear-filters" onClick={handleClearFilters}>
              <X size={14} />
              Clear All Filters
            </button>
          </aside>

          <div className="browse-results">
            <div className="browse-results__header">
              <div>{filteredCars.length} cars</div>
              <button
                className="filters-toggle"
                type="button"
                onClick={() => setShowFilters((value) => !value)}
              >
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
            </div>
            {isLoading ? (
              <div className="empty-state">Loading vehicles…</div>
            ) : isError ? (
              <div className="empty-state">Failed to load vehicles. Please try again later.</div>
            ) : filteredCars.length === 0 ? (
              <div className="empty-state">No cars match your filters yet.</div>
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
                    onFavorite={() => handleFavorite(car.id)}
                    pricePeriod="month"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

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
