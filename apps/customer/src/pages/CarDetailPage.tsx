import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Vehicle } from '@carflow/shared'
import {
  computeRentalTotal,
  computeTax,
  defaultRentalStartDate,
  formatCurrency,
  vehicleCategoryLabel,
} from '@carflow/shared'
import { apiRequest } from '@carflow/shared'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { useAuth } from '../contexts/AuthContext'
import { useCartStore } from '../stores/cartStore'
import './CarDetailPage.css'

const DURATION_OPTIONS = [
  { months: 1, label: '1 month' },
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
]

const PENDING_BOOK_KEY = 'carflow-pending-book'

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
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const setCart = useCartStore((s) => s.setCart)
  const setVehicle = useCartStore((s) => s.setVehicle)

  const [durationMonths, setDurationMonths] = useState(
    Number(searchParams.get('months')) || 1
  )
  const [startDate, setStartDate] = useState(
    searchParams.get('start') || defaultRentalStartDate()
  )
  const [paymentMethod, setPaymentMethod] = useState<'pay_at_shop' | 'skipcash_online'>('pay_at_shop')
  const [error, setError] = useState('')

  const { data: vehicle, isLoading, isError, error: loadError } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () =>
      apiRequest<Vehicle>(`/customer/vehicles/${id}`),
    enabled: Boolean(id),
  })

  const total = useMemo(() => {
    if (!vehicle) return 0
    return computeRentalTotal(vehicle.pricePerDay, durationMonths)
  }, [vehicle, durationMonths])

  const monthlyEstimate = useMemo(() => {
    if (!vehicle) return 0
    return computeRentalTotal(vehicle.pricePerDay, 1)
  }, [vehicle])

  useEffect(() => {
    const months = searchParams.get('months')
    const start = searchParams.get('start')
    if (months) setDurationMonths(Number(months) || 1)
    if (start) setStartDate(start)
  }, [searchParams])

  useEffect(() => {
    if (!session || !id) return
    const raw = sessionStorage.getItem(PENDING_BOOK_KEY)
    if (!raw) return
    try {
      const pending = JSON.parse(raw) as {
        vehicleId: string
        durationMonths?: number
        startDate?: string
        paymentMethod?: 'pay_at_shop' | 'skipcash_online'
      }
      if (pending.vehicleId === id) {
        if (pending.durationMonths) setDurationMonths(pending.durationMonths)
        if (pending.startDate) setStartDate(pending.startDate)
        if (pending.paymentMethod) setPaymentMethod(pending.paymentMethod)
        sessionStorage.removeItem(PENDING_BOOK_KEY)
        // Continue into checkout after login
        window.setTimeout(() => {
          const form = document.getElementById('car-book-form') as HTMLFormElement | null
          form?.requestSubmit()
        }, 0)
      }
    } catch {
      sessionStorage.removeItem(PENDING_BOOK_KEY)
    }
  }, [session, id])

  const handleRequest = (e: FormEvent) => {
    e.preventDefault()
    if (!vehicle || !id) return

    if (!session) {
      sessionStorage.setItem(
        PENDING_BOOK_KEY,
        JSON.stringify({
          vehicleId: id,
          durationMonths,
          startDate,
          paymentMethod,
        })
      )
      navigate(`/login?redirect=${encodeURIComponent(`/car/${id}`)}`)
      return
    }

    const durationLabel = `${durationMonths} month${durationMonths > 1 ? 's' : ''}`
    const subtotal = total
    const tax = computeTax(subtotal)
    const grandTotal = subtotal + tax

    setVehicle({
      id: vehicle.id,
      name: vehicle.name,
      make: vehicle.make,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      seats: vehicle.seats,
      image: vehicle.imageUrl,
      pricePerDay: vehicle.pricePerDay,
    })
    setCart({
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      vehicleMake: vehicle.make,
      durationLabel,
      durationMonths,
      quantity: 1,
      startDate,
      notes: JSON.stringify({ paymentMethod }),
      subtotal,
      tax,
      total: grandTotal,
    })
    setError('')
    navigate('/checkout')
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
            {loadError instanceof Error ? loadError.message : 'Could not load this vehicle.'}
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
                {vehicle.make} {vehicle.model} · {vehicle.year} · {vehicleCategoryLabel(vehicle.category)}
              </p>
              <p className="car-detail-price">
                From {formatCurrency(monthlyEstimate)} <span>/ month</span>
              </p>

              <dl className="car-detail-specs car-detail-specs--compact">
                <div className="car-detail-spec">
                  <dt>Fuel</dt>
                  <dd>{fuelLabel(vehicle.fuelType)}</dd>
                </div>
                <div className="car-detail-spec">
                  <dt>Transmission</dt>
                  <dd>{vehicle.transmission === 'manual' ? 'Manual' : 'Automatic'}</dd>
                </div>
                <div className="car-detail-spec">
                  <dt>Seats</dt>
                  <dd>{vehicle.seats}</dd>
                </div>
              </dl>

              <form id="car-book-form" className="car-book-form" onSubmit={handleRequest}>
                <h2 className="car-book-heading">Book this car</h2>

                <div className="car-book-field">
                  <span className="car-book-label">Duration</span>
                  <div className="car-book-chips">
                    {DURATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.months}
                        type="button"
                        className={`car-book-chip ${durationMonths === opt.months ? 'active' : ''}`}
                        onClick={() => setDurationMonths(opt.months)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="car-book-field">
                  <span className="car-book-label">Start date</span>
                  <input
                    type="date"
                    value={startDate}
                    min={defaultRentalStartDate()}
                    onChange={(ev) => setStartDate(ev.target.value)}
                    className="car-book-input"
                  />
                </label>

                <div className="car-book-field">
                  <span className="car-book-label">Payment</span>
                  <label className="car-book-payment">
                    <input
                      type="radio"
                      name="payment"
                      checked={paymentMethod === 'pay_at_shop'}
                      onChange={() => setPaymentMethod('pay_at_shop')}
                    />
                    <span>
                      <strong>Pay at pickup</strong>
                      <small>Default — pay the dealer when you collect the car</small>
                    </span>
                  </label>
                  <label className="car-book-payment">
                    <input
                      type="radio"
                      name="payment"
                      checked={paymentMethod === 'skipcash_online'}
                      onChange={() => setPaymentMethod('skipcash_online')}
                    />
                    <span>
                      <strong>Pay now with card</strong>
                      <small>Confirm details on the next step</small>
                    </span>
                  </label>
                </div>

                <div className="car-book-total">
                  <span>Total for {durationMonths} month{durationMonths > 1 ? 's' : ''}</span>
                  <strong>{formatCurrency(total)}</strong>
                </div>

                {error && <p className="car-book-error">{error}</p>}

                <button type="submit" className="car-detail-configure">
                  {session ? 'Continue to checkout' : 'Sign in to continue'}
                </button>
                {!session && (
                  <p className="car-book-guest-hint">
                    Browse freely — sign in when you&apos;re ready to request.{' '}
                    <Link to={`/signup?redirect=${encodeURIComponent(`/car/${id}`)}`}>Create account</Link>
                  </p>
                )}
              </form>
            </div>
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  )
}
