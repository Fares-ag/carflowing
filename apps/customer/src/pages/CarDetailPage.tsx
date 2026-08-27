import type { Vehicle } from '@carflow/shared'
import {
  apiRequest,
  computeFirstMonthDue,
  computeMinimumTermTotal,
  computeSubscriptionMonthly,
  formatCurrency,
  formatDate,
  SUBSCRIPTION_DURATION_OPTIONS,
  defaultRentalStartDate,
  formatVehicleLocation,
  vehicleCategoryLabel,
  vehicleGalleryUrls,
} from '@carflow/shared'
import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SubscriptionPricingSummary } from '../components/booking/SubscriptionPricingSummary'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import { useAuth } from '../contexts/AuthContext'
import { useCartStore } from '../stores/cartStore'
import { getPricingSettings, getVehicleReviews } from '../services/customerService'
import './CarDetailPage.css'

const DURATION_OPTIONS = SUBSCRIPTION_DURATION_OPTIONS.map((o) => ({
  months: o.months,
  label: o.label,
}))

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
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)

  const { data: vehicle, isLoading, isError, error: loadError } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () =>
      apiRequest<Vehicle>(`/customer/vehicles/${id}`),
    enabled: Boolean(id),
  })

  const { data: pricingSettings } = useQuery({
    queryKey: ['pricing-settings'],
    queryFn: getPricingSettings,
  })

  const { data: reviewsData } = useQuery({
    queryKey: ['vehicle-reviews', id],
    queryFn: () => getVehicleReviews(id!, { pageSize: 20 }),
    enabled: Boolean(id),
  })

  const gallery = useMemo(() => (vehicle ? vehicleGalleryUrls(vehicle) : []), [vehicle])
  const activePhoto = gallery[activePhotoIndex] ?? gallery[0]

  useEffect(() => {
    setActivePhotoIndex(0)
  }, [vehicle?.id])

  const depositAmount = pricingSettings?.subscriptionDepositAmount ?? 0
  const locationLabel = vehicle ? formatVehicleLocation(vehicle) : undefined

  const monthlyPrice = useMemo(() => {
    if (!vehicle) return 0
    return computeSubscriptionMonthly(vehicle.pricePerDay, durationMonths)
  }, [vehicle, durationMonths])

  const firstMonth = useMemo(() => {
    if (!vehicle) return { monthly: 0, total: 0 }
    return computeFirstMonthDue(vehicle.pricePerDay, durationMonths)
  }, [vehicle, durationMonths])

  const termPricing = useMemo(() => {
    if (!vehicle) return { subtotal: 0, total: 0 }
    return computeMinimumTermTotal(vehicle.pricePerDay, durationMonths)
  }, [vehicle, durationMonths])

  const fromMonthlyPrice = useMemo(() => {
    if (!vehicle) return 0
    return computeSubscriptionMonthly(vehicle.pricePerDay, 1)
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

    const durationLabel = `${durationMonths} month${durationMonths > 1 ? 's' : ''} minimum`

    setVehicle({
      id: vehicle.id,
      name: vehicle.name,
      make: vehicle.make,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      seats: vehicle.seats,
      image: activePhoto ?? vehicle.imageUrl,
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
      subtotal: termPricing.subtotal,
      total: termPricing.total,
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
            <div className="car-detail-left">
              <div className="car-detail-media">
                {activePhoto ? (
                  <img src={activePhoto} alt={vehicle.name} className="car-detail-image" />
                ) : (
                  <div className="car-detail-image car-detail-image--placeholder" aria-hidden />
                )}
              </div>
              {gallery.length > 1 && (
                <div className="car-detail-gallery" role="group" aria-label="Vehicle photos">
                  {gallery.map((url, index) => (
                    <button
                      key={`${url}-${index}`}
                      type="button"
                      className={`car-detail-thumb ${index === activePhotoIndex ? 'active' : ''}`}
                      onClick={() => setActivePhotoIndex(index)}
                      aria-label={`View photo ${index + 1}`}
                      aria-current={index === activePhotoIndex ? 'true' : undefined}
                    >
                      <img src={url} alt="" />
                    </button>
                  ))}
                </div>
              )}

              {vehicle.description && (
                <section className="car-detail-section">
                  <h2 className="car-detail-section-title">About this vehicle</h2>
                  <p className="car-detail-description">{vehicle.description}</p>
                </section>
              )}

              {vehicle.features && vehicle.features.length > 0 && (
                <section className="car-detail-section">
                  <h2 className="car-detail-section-title">Features</h2>
                  <ul className="car-detail-features">
                    {vehicle.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </section>
              )}

              {(reviewsData?.reviewCount ?? vehicle.reviewCount ?? 0) > 0 && (
                <section className="car-detail-section car-detail-reviews">
                  <div className="car-detail-reviews__header">
                    <h2 className="car-detail-section-title">Customer reviews</h2>
                    <div className="car-detail-rating-summary">
                      <Star size={18} fill="#f59e0b" color="#f59e0b" />
                      <strong>
                        {(reviewsData?.averageRating ?? vehicle.averageRating ?? 0).toFixed(1)}
                      </strong>
                      <span>
                        ({reviewsData?.reviewCount ?? vehicle.reviewCount} review
                        {(reviewsData?.reviewCount ?? vehicle.reviewCount) === 1 ? '' : 's'})
                      </span>
                    </div>
                  </div>
                  <ul className="car-detail-review-list">
                    {(reviewsData?.items ?? []).map((review) => (
                      <li key={review.id} className="car-detail-review">
                        <div className="car-detail-review__head">
                          <div className="car-detail-review__stars" aria-label={`${review.rating} out of 5`}>
                            {Array.from({ length: 5 }, (_, i) => (
                              <Star
                                key={i}
                                size={14}
                                fill={i < review.rating ? '#f59e0b' : 'none'}
                                color={i < review.rating ? '#f59e0b' : '#d1d5db'}
                              />
                            ))}
                          </div>
                          <span className="car-detail-review__meta">
                            {review.customerName ? `${review.customerName} · ` : ''}
                            {formatDate(review.createdAt)}
                          </span>
                        </div>
                        {review.comment && <p className="car-detail-review__comment">{review.comment}</p>}
                        {review.dealerResponse && (
                          <blockquote className="car-detail-review__response">
                            <strong>Dealer response</strong>
                            <p>{review.dealerResponse}</p>
                          </blockquote>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className="car-detail-panel">
              <h1 className="car-detail-title">{vehicle.name}</h1>
              {(vehicle.averageRating ?? 0) > 0 && (
                <p className="car-detail-rating-inline">
                  <Star size={16} fill="#f59e0b" color="#f59e0b" />
                  {vehicle.averageRating!.toFixed(1)}
                  {vehicle.reviewCount ? ` (${vehicle.reviewCount} reviews)` : ''}
                </p>
              )}
              <p className="car-detail-subtitle">
                {vehicle.make} {vehicle.model} · {vehicle.year} · {vehicleCategoryLabel(vehicle.category)}
              </p>
              {locationLabel && (
                <p className="car-detail-location">{locationLabel}</p>
              )}
              <p className="car-detail-price">
                From {formatCurrency(fromMonthlyPrice)} <span>/ month</span>
              </p>

              <dl className="car-detail-specs">
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
                {vehicle.color && (
                  <div className="car-detail-spec">
                    <dt>Color</dt>
                    <dd>{vehicle.color}</dd>
                  </div>
                )}
                <div className="car-detail-spec">
                  <dt>Odometer</dt>
                  <dd>{vehicle.mileage.toLocaleString()} km</dd>
                </div>
                {vehicle.mileageCapKm != null && vehicle.mileageCapKm > 0 && (
                  <div className="car-detail-spec">
                    <dt>Monthly mileage cap</dt>
                    <dd>{vehicle.mileageCapKm.toLocaleString()} km</dd>
                  </div>
                )}
                {depositAmount > 0 && (
                  <div className="car-detail-spec">
                    <dt>Security deposit</dt>
                    <dd>{formatCurrency(depositAmount)}</dd>
                  </div>
                )}
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

                <SubscriptionPricingSummary
                  monthly={monthlyPrice}
                  firstMonthTotal={firstMonth.total}
                  durationMonths={durationMonths}
                  minimumTermTotal={termPricing.total}
                  depositAmount={depositAmount}
                  showValueProps
                />

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
