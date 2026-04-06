import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Calendar,
  ChevronDown,
  CircleCheck,
  Clock,
  Headphones,
  Minus,
  Plus,
  ReceiptText,
  ShieldCheck,
  Star,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { useQuery } from '@tanstack/react-query'
import { InfoModal } from '../components/shared/InfoModal'
import { toast } from '../hooks/useToast'
import { useCartStore, type CartItem, type CartVehicle } from '../stores/cartStore'
import { listCatalogVehicles } from '../services/customerService'
import './ShoppingCartPage.css'

const DURATION_OPTIONS = [
  { label: '1 Month', months: 1, discount: 0 },
  { label: '3 Months (5% discount)', months: 3, discount: 0.05 },
  { label: '6 Months (10% discount)', months: 6, discount: 0.1 },
]

export function ShoppingCartPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { vehicle: storedVehicle, setVehicle, setCart, clearCart } = useCartStore()
  const vehicleFromBrowse = (location.state as { vehicle?: CartVehicle })?.vehicle

  const [duration, setDuration] = useState(DURATION_OPTIONS[1])
  const [quantity, setQuantity] = useState(1)
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [isRemoved, setIsRemoved] = useState(false)
  const [showPromo, setShowPromo] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoDiscount, setPromoDiscount] = useState(0)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [isDurationOpen, setIsDurationOpen] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<CartVehicle | null>(vehicleFromBrowse ?? null)

  const baseMonthlyPrice = selectedVehicle?.pricePerDay
    ? Math.round(selectedVehicle.pricePerDay * 30)
    : 749

  const pricing = useMemo(() => {
    const discountedMonthly = Math.round(baseMonthlyPrice * (1 - duration.discount))
    const lineSubtotal = discountedMonthly * duration.months * quantity
    const subtotal = isRemoved ? 0 : lineSubtotal
    const promoSavings = Math.round(subtotal * promoDiscount)
    const taxable = subtotal - promoSavings
    const tax = Math.round(taxable * 0.05)
    const total = taxable + tax
    return { discountedMonthly, subtotal, promoSavings, tax, total }
  }, [duration, quantity, isRemoved, promoDiscount, baseMonthlyPrice])

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

  const applyPromo = () => {
    const code = promoCode.trim().toUpperCase()
    const discounts: Record<string, number> = {
      NEWUSER20: 0.2,
      WEEKEND15: 0.15,
      LOYALTY10: 0.1,
    }
    const discount = discounts[code] ?? 0
    setPromoDiscount(discount)
    if (!discount) {
      toast.error('Invalid promo code.')
    }
  }

  return (
    <div className="shopping-cart-page">
      <Header />

      <section className="shopping-header">
        <div className="shopping-header__inner">
          <Link className="shopping-back" to="/browse">
            ← Back to Browse
          </Link>
          <div>
            <h1>Shopping Cart</h1>
            <p>{quantity} car{quantity > 1 ? 's' : ''} selected for rental</p>
          </div>
        </div>
      </section>

      <section className="shopping-content">
        <div className="shopping-content__inner">
          <div className="shopping-main">
            {isRemoved ? (
              <div className="cart-card cart-card--empty">
                <div>
                  <h3>Your cart is empty</h3>
                  <p>Pick a vehicle to continue your rental journey.</p>
                </div>
                <Link to="/browse" className="checkout-button">Browse Cars</Link>
              </div>
            ) : (
              <div className="cart-card">
              <div className="cart-card__image">
                <div className="cart-card__badge">{duration.months} Months</div>
                {selectedVehicle?.image ? (
                  <img src={selectedVehicle.image} alt={selectedVehicle.name} className="cart-card__image-img" />
                ) : (
                  <div className="cart-card__image-placeholder">
                    {selectedVehicle?.name ?? 'Vehicle'}
                  </div>
                )}
              </div>
              <div className="cart-card__details">
                <div className="cart-card__top">
                  <div>
                    <h3>{selectedVehicle?.name ?? 'Vehicle'}</h3>
                    <div className="cart-card__rating">
                      <span>{selectedVehicle?.make ?? 'Brand'}</span>
                      <span className="cart-card__rating-badge">
                        <Star size={12} /> 4.7
                      </span>
                    </div>
                  </div>
                  <button type="button" className="icon-button" onClick={() => { setIsRemoved(true); clearCart() }}>
                    <X size={14} />
                  </button>
                </div>

                <div className="cart-card__meta">
                  <span><Zap size={14} /> {selectedVehicle?.fuelType ?? 'hybrid'}</span>
                  <span><Users size={14} /> {selectedVehicle?.seats ?? 5} seats</span>
                  <span><Wrench size={14} /> {selectedVehicle?.transmission === 'manual' ? 'Manual' : 'Automatic'}</span>
                  <span><Calendar size={14} /> {duration.months} months</span>
                </div>

                <div className="cart-card__controls">
                  <div className="cart-input">
                    <label>Rental Duration</label>
                    <button type="button" className="select-button" onClick={() => setIsDurationOpen((open) => !open)}>
                      {duration.label}
                      <ChevronDown size={14} />
                    </button>
                    <div className={`select-menu ${isDurationOpen ? 'open' : ''}`}>
                      {DURATION_OPTIONS.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => {
                            setDuration(option)
                            setIsDurationOpen(false)
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="cart-input">
                    <label>Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                  </div>
                  <div className="cart-input">
                    <label>Quantity</label>
                    <div className="quantity-control">
                      <button
                        type="button"
                        onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                      >
                        <Minus size={14} />
                      </button>
                      <span>{quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQuantity((current) => current + 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="cart-card__summary">
                  <div>
                    <div className="cart-card__price">
                      QAR {pricing.discountedMonthly}/month
                      {duration.discount > 0 && (
                        <span className="discount-badge">{Math.round(duration.discount * 100)}% OFF</span>
                      )}
                    </div>
                    <div className="cart-card__subtext">
                      {duration.months} months × {quantity} unit
                    </div>
                    <div className="cart-card__subtext">
                      {startDate} - {(() => {
                        const end = new Date(startDate)
                        end.setDate(end.getDate() + duration.months * 30)
                        return end.toISOString().split('T')[0]
                      })()}
                    </div>
                  </div>
                  <div className="cart-card__total">
                    <div>QAR {pricing.subtotal.toLocaleString()}</div>
                    <span>total amount</span>
                  </div>
                </div>
              </div>
            </div>
            )}

            <div className="cart-card cart-card--secondary">
              <h4>Special Requests</h4>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Any special requests or requirements? (e.g., child seat, GPS, additional driver, delivery location)"
              />
              <p>Additional charges may apply for special equipment</p>
            </div>
          </div>

          <aside className="shopping-sidebar">
            <div className="summary-card">
              <h4><ReceiptText size={16} /> Order Summary</h4>
              <div className="summary-row">
                <span>Subtotal ({quantity} car{quantity > 1 ? 's' : ''})</span>
                <span>QAR {pricing.subtotal.toLocaleString()}</span>
              </div>
              <div className="summary-row">
                <span>Tax (5%)</span>
                <span>QAR {pricing.tax.toLocaleString()}</span>
              </div>
              {pricing.promoSavings > 0 && (
                <div className="summary-row">
                  <span>Promo Savings</span>
                  <span>- QAR {pricing.promoSavings.toLocaleString()}</span>
                </div>
              )}
              <div className="summary-divider" />
              <div className="summary-row total">
                <span>Total</span>
                <span>QAR {pricing.total.toLocaleString()}</span>
              </div>
              <div className="summary-divider" />
              <button
                className="summary-action"
                type="button"
                onClick={() => {
                  if (!showPromo) {
                    setShowPromo(true)
                    return
                  }
                  applyPromo()
                }}
              >
                <CircleCheck size={14} />
                {showPromo ? 'Apply Promo' : 'Add Promo Code'}
              </button>
              {showPromo && (
                <div className="promo-input">
                  <input
                    type="text"
                    placeholder="Enter promo code"
                    value={promoCode}
                    onChange={(event) => setPromoCode(event.target.value)}
                  />
                </div>
              )}
              <p className="summary-hint">Try: NEWUSER20, WEEKEND15, LOYALTY10</p>
              <div className="summary-divider" />
              <button
                className="checkout-button"
                type="button"
                onClick={() => {
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
                    quantity,
                    startDate,
                    notes,
                    subtotal: pricing.subtotal,
                    tax: pricing.tax,
                    total: pricing.total,
                    promoCode: promoCode || undefined,
                  }
                  setCart(cart)
                  navigate('/checkout')
                }}
              >
                Proceed to Checkout <ChevronDown size={14} />
              </button>
              <p className="summary-hint">Complete billing and delivery details in the next steps.</p>
              <div className="summary-note">
                <ShieldCheck size={14} />
                Secure checkout • Free cancellation up to 24 hours
              </div>
            </div>

            <div className="support-card">
              <div className="support-row"><Headphones size={16} /> 24/7 Customer Support</div>
              <div className="support-row"><Clock size={16} /> Free Cancellation</div>
              <div className="support-row"><CircleCheck size={16} /> Verified Dealers</div>
              <div className="support-row"><ShieldCheck size={16} /> Secure Payment</div>
            </div>
          </aside>
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
