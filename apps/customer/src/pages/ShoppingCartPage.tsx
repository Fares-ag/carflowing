import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Calendar, ChevronRight, X } from 'lucide-react'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { useQuery } from '@tanstack/react-query'
import { computeMonthlyPrice } from '@carflow/shared'
import { toast } from '../hooks/useToast'
import { useCartStore, type CartItem, type CartVehicle } from '../stores/cartStore'
import { listCatalogVehicles } from '../services/customerService'
import './ShoppingCartPage.css'

const DURATION_OPTIONS = [
  { label: '1 month', months: 1, discount: 0 },
  { label: '3 months', months: 3, discount: 0.05 },
  { label: '6 months', months: 6, discount: 0.1 },
]

export function ShoppingCartPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { vehicle: storedVehicle, setVehicle, setCart, clearCart } = useCartStore()
  const vehicleFromBrowse = (location.state as { vehicle?: CartVehicle })?.vehicle

  const [durationMonths, setDurationMonths] = useState(1)
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [isRemoved, setIsRemoved] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<CartVehicle | null>(vehicleFromBrowse ?? null)

  const duration = DURATION_OPTIONS.find((o) => o.months === durationMonths) ?? DURATION_OPTIONS[0]

  const baseMonthlyPrice = selectedVehicle?.pricePerDay
    ? computeMonthlyPrice(selectedVehicle.pricePerDay)
    : 749

  const pricing = useMemo(() => {
    const discountedMonthly = computeMonthlyPrice(baseMonthlyPrice / 30, duration.discount)
    const subtotal = isRemoved ? 0 : discountedMonthly * duration.months
    const tax = Math.round(subtotal * 0.05)
    const total = subtotal + tax
    return { discountedMonthly, subtotal, tax, total }
  }, [duration, isRemoved, baseMonthlyPrice])

  const endDate = useMemo(() => {
    const end = new Date(startDate)
    end.setMonth(end.getMonth() + duration.months)
    return end.toISOString().split('T')[0]
  }, [startDate, duration.months])

  const { data: catalogData } = useQuery({
    queryKey: ['catalog', 'fallback'],
    queryFn: () => listCatalogVehicles({ pageSize: 1 }),
    enabled: !vehicleFromBrowse && !storedVehicle,
  })

  useEffect(() => {
    if (vehicleFromBrowse) {
      setVehicle(vehicleFromBrowse)
      setSelectedVehicle(vehicleFromBrowse)
      return
    }
    if (storedVehicle) {
      setSelectedVehicle(storedVehicle)
      return
    }
    const vehicle = catalogData?.items[0]
    if (vehicle) {
      const v: CartVehicle = {
        id: vehicle.id,
        name: vehicle.name,
        make: vehicle.make,
        fuelType: vehicle.fuelType,
        transmission: vehicle.transmission,
        seats: vehicle.seats,
        image: vehicle.imageUrl,
        pricePerDay: vehicle.pricePerDay,
      }
      setSelectedVehicle(v)
    }
  }, [vehicleFromBrowse, storedVehicle, catalogData, setVehicle])

  const handleCheckout = () => {
    if (!selectedVehicle) {
      toast.error('Please select a vehicle to continue.')
      return
    }
    const cart: CartItem = {
      vehicleId: selectedVehicle.id,
      vehicleName: selectedVehicle.name,
      vehicleMake: selectedVehicle.make,
      durationLabel: duration.label,
      durationMonths: duration.months,
      quantity: 1,
      startDate,
      notes,
      subtotal: pricing.subtotal,
      tax: pricing.tax,
      total: pricing.total,
    }
    setCart(cart)
    navigate('/checkout')
  }

  return (
    <div className="shopping-cart-page">
      <Header />

      <section className="cart-simple">
        <div className="cart-simple__inner">
          <Link className="cart-simple__back" to="/browse">
            ← Back to cars
          </Link>

          <h1 className="cart-simple__title">Review your rental</h1>

          {isRemoved ? (
            <div className="cart-simple__card cart-simple__card--empty">
              <p>Your cart is empty.</p>
              <Link to="/browse" className="cart-simple__cta">
                Browse cars
              </Link>
            </div>
          ) : (
            <div className="cart-simple__card">
              <div className="cart-simple__vehicle">
                <div className="cart-simple__image">
                  {selectedVehicle?.image ? (
                    <img src={selectedVehicle.image} alt={selectedVehicle.name} />
                  ) : (
                    <span>{selectedVehicle?.name ?? 'Vehicle'}</span>
                  )}
                </div>
                <div className="cart-simple__vehicle-info">
                  <div className="cart-simple__vehicle-top">
                    <div>
                      <h2>{selectedVehicle?.name ?? 'Vehicle'}</h2>
                      <p>{selectedVehicle?.make ?? 'Brand'}</p>
                    </div>
                    <button
                      type="button"
                      className="cart-simple__remove"
                      aria-label="Remove from cart"
                      onClick={() => {
                        setIsRemoved(true)
                        clearCart()
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="cart-simple__specs">
                    {[
                      selectedVehicle?.transmission === 'manual' ? 'Manual' : 'Automatic',
                      selectedVehicle?.fuelType,
                      selectedVehicle?.seats ? `${selectedVehicle.seats} seats` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>

              <div className="cart-simple__fields">
                <label className="cart-simple__field">
                  <span>How long?</span>
                  <select
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(Number(e.target.value))}
                  >
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.months} value={option.months}>
                        {option.label}
                        {option.discount > 0 ? ` (${Math.round(option.discount * 100)}% off)` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="cart-simple__field">
                  <span>Start date</span>
                  <input
                    type="date"
                    value={startDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
              </div>

              <p className="cart-simple__dates">
                <Calendar size={14} />
                {startDate} → {endDate}
              </p>

              {!showNotes ? (
                <button
                  type="button"
                  className="cart-simple__notes-toggle"
                  onClick={() => setShowNotes(true)}
                >
                  Add a note (optional)
                </button>
              ) : (
                <label className="cart-simple__field">
                  <span>Note for the dealer (optional)</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. child seat, GPS, pickup location"
                    rows={2}
                  />
                </label>
              )}

              <div className="cart-simple__total">
                <div className="cart-simple__total-row">
                  <span>Rental ({duration.label})</span>
                  <span>QAR {pricing.subtotal.toLocaleString()}</span>
                </div>
                <div className="cart-simple__total-row cart-simple__total-row--muted">
                  <span>Tax (5%)</span>
                  <span>QAR {pricing.tax.toLocaleString()}</span>
                </div>
                <div className="cart-simple__total-row cart-simple__total-row--grand">
                  <span>Total</span>
                  <span>QAR {pricing.total.toLocaleString()}</span>
                </div>
              </div>

              <button type="button" className="cart-simple__cta" onClick={handleCheckout}>
                Continue to checkout
                <ChevronRight size={18} />
              </button>

              <p className="cart-simple__fineprint">
                Free cancellation up to 24 hours before pickup
              </p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
