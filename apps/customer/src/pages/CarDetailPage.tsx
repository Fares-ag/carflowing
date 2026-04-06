import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Vehicle } from '@carflow/shared'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { getVehicle } from '../services/customerService'
import { useCartStore } from '../stores/cartStore'
import './CarDetailPage.css'

function categoryLabel(category: Vehicle['category']): string {
  switch (category) {
    case 'suv':
      return 'SUV'
    case 'ev':
      return 'Electric'
    case 'luxury':
      return 'Luxury'
    case 'sedan':
      return 'Sedan'
    case 'truck':
      return 'Truck'
    default:
      return 'Other'
  }
}

function fuelLabel(fuel: Vehicle['fuelType']): string {
  switch (fuel) {
    case 'gas':
      return 'Petrol'
    case 'diesel':
      return 'Diesel'
    case 'electric':
      return 'Electric'
    case 'hybrid':
      return 'Hybrid'
    default:
      return fuel
  }
}

export function CarDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const setVehicle = useCartStore((s) => s.setVehicle)

  const { data: vehicle, isLoading, isError, error } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => getVehicle(id!),
    enabled: Boolean(id),
  })

  const detailRows = useMemo(() => {
    if (!vehicle) return []
    return [
      { label: 'Make / model', value: `${vehicle.make} ${vehicle.model}` },
      { label: 'Year', value: String(vehicle.year) },
      { label: 'Category', value: categoryLabel(vehicle.category) },
      { label: 'Fuel type', value: fuelLabel(vehicle.fuelType) },
      {
        label: 'Transmission',
        value: vehicle.transmission === 'manual' ? 'Manual' : 'Automatic',
      },
      { label: 'Seats', value: String(vehicle.seats) },
      { label: 'Mileage', value: `${vehicle.mileage.toLocaleString()} km` },
      {
        label: 'Price per day',
        value: `QAR ${vehicle.pricePerDay.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      },
    ]
  }, [vehicle])

  const handleConfigure = () => {
    if (!vehicle) return
    const displayPrice = Math.round(vehicle.pricePerDay * 6)
    setVehicle({
      id: vehicle.id,
      name: vehicle.name,
      make: vehicle.make,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission === 'manual' ? 'Manual' : 'Automatic',
      seats: vehicle.seats,
      image: vehicle.imageUrl,
      pricePerDay: Math.round(displayPrice / 6),
    })
    navigate('/cart')
  }

  return (
    <div className="car-detail-page">
      <Header />
      <main className="car-detail-main">
        <Link to="/browse" className="car-detail-back">
          ← Back to Browse
        </Link>

        {!id ? (
          <p className="car-detail-state car-detail-state--error">Invalid vehicle link.</p>
        ) : isLoading ? (
          <p className="car-detail-state">Loading vehicle…</p>
        ) : isError ? (
          <p className="car-detail-state car-detail-state--error">
            {error instanceof Error ? error.message : 'Could not load this vehicle.'}
          </p>
        ) : vehicle ? (
          <div className="car-detail-layout">
            <div className="car-detail-media">
              {vehicle.imageUrl ? (
                <img src={vehicle.imageUrl} alt={vehicle.name} className="car-detail-image" />
              ) : (
                <div className="car-detail-image car-detail-image--placeholder" aria-hidden />
              )}
            </div>
            <div className="car-detail-panel">
              <h1 className="car-detail-title">{vehicle.name}</h1>
              <p className="car-detail-subtitle">
                {vehicle.make} {vehicle.model} · {vehicle.year}
              </p>
              <dl className="car-detail-specs">
                {detailRows.map((row) => (
                  <div key={row.label} className="car-detail-spec">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <button type="button" className="car-detail-configure" onClick={handleConfigure}>
                Configure
              </button>
            </div>
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  )
}
