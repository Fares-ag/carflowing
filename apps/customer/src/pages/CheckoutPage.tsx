import { useState, FormEvent, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { ProcessingOverlay } from '../components/shared/ProcessingOverlay'
import { toast } from '../hooks/useToast'
import { useCartStore } from '../stores/cartStore'
import {
  createBookingRequest,
  getCustomerProfile,
  updateCustomerDocuments,
} from '../services/customerService'
import { uploadCustomerDocument, supabase, type CustomerDocumentType } from '@carflow/shared'
import { Check, ChevronRight, FileCheck, MapPin, Store, User } from 'lucide-react'
import './CheckoutPage.css'

export type { CartItem } from '../stores/cartStore'

const STEPS = ['Details', 'Documents', 'Confirm'] as const

export function CheckoutPage() {
  const navigate = useNavigate()
  const { cart, clearCart } = useCartStore()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [billingComplete, setBillingComplete] = useState(false)
  const [documentsComplete, setDocumentsComplete] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [profile, setProfile] = useState<{ qid_document_path: string | null; drivers_license_path: string | null } | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState<'qid' | 'drivers_license' | null>(null)
  const [documentError, setDocumentError] = useState('')

  useEffect(() => {
    getCustomerProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
  }, [])

  const [contact, setContact] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  })
  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    zip: '',
  })
  const [payment] = useState<{ method: 'pay_at_shop' }>({ method: 'pay_at_shop' })
  const [delivery, setDelivery] = useState({
    location: '',
    date: cart?.startDate ?? '',
    time: '10:00',
  })

  useEffect(() => {
    if (!cart) navigate('/cart', { replace: true })
  }, [cart, navigate])

  if (!cart) {
    return (
      <div className="checkout-page">
        <Header />
        <div style={{ padding: '4rem', textAlign: 'center' }}>Redirecting to cart…</div>
        <Footer />
      </div>
    )
  }

  const validateBilling = (): boolean => {
    const errs: Record<string, string> = {}
    if (!contact.firstName.trim()) errs.firstName = 'This field is required'
    if (!contact.lastName.trim()) errs.lastName = 'This field is required'
    if (!contact.email.trim()) errs.email = 'This field is required'
    if (!contact.phone.trim()) errs.phone = 'This field is required'
    if (!address.street.trim()) errs.street = 'This field is required'
    if (!address.city.trim()) errs.city = 'This field is required'
    if (!address.state.trim()) errs.state = 'This field is required'
    if (!address.zip.trim()) errs.zip = 'This field is required'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const validatePayment = (): boolean => {
    setFieldErrors({})
    return true
  }

  const validateDelivery = (): boolean => {
    const errs: Record<string, string> = {}
    if (!delivery.location.trim()) errs.location = 'This field is required'
    if (!delivery.date.trim()) errs.date = 'This field is required'
    if (!delivery.time.trim()) errs.time = 'This field is required'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleBillingNext = (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!validateBilling()) {
      setFormError('Please fill in all required fields to proceed.')
      return
    }
    setBillingComplete(true)
    setStep(2)
  }

  const hasQid = !!profile?.qid_document_path
  const hasDriversLicense = !!profile?.drivers_license_path
  const canProceedFromDocuments = hasQid && hasDriversLicense

  const handleDocumentUpload = async (type: CustomerDocumentType, file: File) => {
    setDocumentError('')
    setUploadingDoc(type === 'qid' ? 'qid' : 'drivers_license')
    try {
      const { data } = await supabase.auth.getUser()
      const userId = data.user?.id
      if (!userId) throw new Error('Not authenticated')
      const path = await uploadCustomerDocument(file, userId, type)
      const updated = await updateCustomerDocuments(
        type === 'qid' ? { qid_document_path: path } : { drivers_license_path: path }
      )
      setProfile(updated)
      toast.success(type === 'qid' ? 'QID document uploaded' : 'Driver\'s license uploaded')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setDocumentError(msg)
      toast.error(msg)
    } finally {
      setUploadingDoc(null)
    }
  }

  const handleDocumentsNext = (e: FormEvent) => {
    e.preventDefault()
    setDocumentError('')
    if (!canProceedFromDocuments) {
      setDocumentError('Please upload both your QID and driver\'s license to continue.')
      return
    }
    setDocumentsComplete(true)
    setStep(3)
  }

  const handleConfirmBooking = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!validateDelivery()) {
      setFormError('Please fill in delivery details to proceed.')
      return
    }
    if (!validatePayment()) return
    setIsProcessing(true)
    try {
      const note = JSON.stringify({
        duration: cart.durationLabel,
        durationMonths: cart.durationMonths,
        startDate: cart.startDate,
        quantity: cart.quantity,
        notes: cart.notes,
        delivery,
        contact,
        paymentMethod: payment.method,
        total: cart.total,
      })
      const booking = await createBookingRequest({
        vehicleId: cart.vehicleId,
        note,
      })
      clearCart()
      toast.success('Request submitted — pending dealer approval')
      navigate('/booking-confirmed', {
        state: {
          booking,
          cart,
          delivery: { location: delivery.location, date: delivery.date, time: delivery.time },
          paymentDisplay: 'Pay at Shop',
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to confirm booking.'
      setFormError(msg)
      toast.error(msg)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="checkout-page">
      <Header />

      <section className="checkout-header">
        <div className="checkout-header__inner">
          <Link className="checkout-back" to="/cart">
            ← Back to Cart
          </Link>
          <h1>Checkout</h1>
        </div>
      </section>

      <div className="checkout-progress">
        <div className="checkout-progress__inner">
          {STEPS.map((label, i) => {
            const stepNum = i + 1
            const isActive = stepNum <= step
            const isDone =
              (billingComplete && stepNum === 1) ||
              (documentsComplete && stepNum === 2)
            return (
              <div
                key={label}
                className={`checkout-progress__step ${isActive ? 'active' : ''}`}
              >
                <span className="checkout-progress__dot">
                  {isDone ? <Check size={14} /> : stepNum}
                </span>
                <span className="checkout-progress__label">{label}</span>
                {i < STEPS.length - 1 && <ChevronRight size={14} className="checkout-progress__arrow" />}
              </div>
            )
          })}
        </div>
      </div>

      <section className="checkout-content">
        <div className="checkout-content__inner">
          <div className="checkout-main">
            {formError && (
              <div className="checkout-banner checkout-banner--error">
                {formError}
              </div>
            )}
            {billingComplete && step === 1 && (
              <div className="checkout-banner checkout-banner--success">
                Your information has been successfully saved.
              </div>
            )}
            {documentsComplete && step === 2 && (
              <div className="checkout-banner checkout-banner--success">
                Documents uploaded. Proceed to delivery and confirmation.
              </div>
            )}

            {step === 1 && (
              <form className="checkout-form" onSubmit={handleBillingNext}>
                <div className="checkout-section">
                  <h3><User size={18} /> Contact Info</h3>
                  <div className="checkout-grid">
                    <label>
                      First Name *
                      <input
                        type="text"
                        value={contact.firstName}
                        onChange={(e) => setContact((c) => ({ ...c, firstName: e.target.value }))}
                        className={fieldErrors.firstName ? 'error' : ''}
                      />
                      {fieldErrors.firstName && <span className="field-error">{fieldErrors.firstName}</span>}
                    </label>
                    <label>
                      Last Name *
                      <input
                        type="text"
                        value={contact.lastName}
                        onChange={(e) => setContact((c) => ({ ...c, lastName: e.target.value }))}
                        className={fieldErrors.lastName ? 'error' : ''}
                      />
                      {fieldErrors.lastName && <span className="field-error">{fieldErrors.lastName}</span>}
                    </label>
                    <label>
                      Email *
                      <input
                        type="email"
                        value={contact.email}
                        onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                        className={fieldErrors.email ? 'error' : ''}
                      />
                      {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
                    </label>
                    <label>
                      Phone Number *
                      <input
                        type="tel"
                        value={contact.phone}
                        onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                        className={fieldErrors.phone ? 'error' : ''}
                      />
                      {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
                    </label>
                  </div>
                </div>

                <div className="checkout-section">
                  <h3><MapPin size={18} /> Billing Address</h3>
                  <div className="checkout-grid">
                    <label className="full">
                      Street Address *
                      <input
                        type="text"
                        value={address.street}
                        onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
                        placeholder="e.g. 123 Main Street"
                        className={fieldErrors.street ? 'error' : ''}
                      />
                      {fieldErrors.street && <span className="field-error">{fieldErrors.street}</span>}
                    </label>
                    <label>
                      City *
                      <input
                        type="text"
                        value={address.city}
                        onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                        className={fieldErrors.city ? 'error' : ''}
                      />
                      {fieldErrors.city && <span className="field-error">{fieldErrors.city}</span>}
                    </label>
                    <label>
                      State *
                      <input
                        type="text"
                        value={address.state}
                        onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))}
                        className={fieldErrors.state ? 'error' : ''}
                      />
                      {fieldErrors.state && <span className="field-error">{fieldErrors.state}</span>}
                    </label>
                    <label>
                      Zip Code *
                      <input
                        type="text"
                        value={address.zip}
                        onChange={(e) => setAddress((a) => ({ ...a, zip: e.target.value }))}
                        className={fieldErrors.zip ? 'error' : ''}
                      />
                      {fieldErrors.zip && <span className="field-error">{fieldErrors.zip}</span>}
                    </label>
                  </div>
                </div>

                <button type="submit" className="checkout-btn checkout-btn--primary">
                  Proceed to Documents
                </button>
              </form>
            )}

            {step === 2 && (
              <form className="checkout-form" onSubmit={handleDocumentsNext}>
                <div className="checkout-section">
                  <h3><FileCheck size={18} /> Identity & License</h3>
                  <p className="checkout-section-desc">
                    Upload your Qatar ID (QID) and driver&apos;s license. Required to complete your rental.
                    Accepted: PDF, JPEG, PNG, WebP (max 10MB each).
                  </p>
                  {documentError && (
                    <div className="checkout-banner checkout-banner--error">{documentError}</div>
                  )}
                  <div className="checkout-documents">
                    <label className="checkout-doc-card">
                      <span className="checkout-doc-label">Qatar ID (QID)</span>
                      {hasQid ? (
                        <span className="checkout-doc-uploaded">
                          <Check size={16} /> Uploaded
                        </span>
                      ) : (
                        <input
                          type="file"
                          accept=".pdf,image/jpeg,image/png,image/webp"
                          disabled={!!uploadingDoc}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file) handleDocumentUpload('qid', file)
                          }}
                        />
                      )}
                      {uploadingDoc === 'qid' && <span className="checkout-doc-loading">Uploading…</span>}
                    </label>
                    <label className="checkout-doc-card">
                      <span className="checkout-doc-label">Driver&apos;s License</span>
                      {hasDriversLicense ? (
                        <span className="checkout-doc-uploaded">
                          <Check size={16} /> Uploaded
                        </span>
                      ) : (
                        <input
                          type="file"
                          accept=".pdf,image/jpeg,image/png,image/webp"
                          disabled={!!uploadingDoc}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file) handleDocumentUpload('drivers_license', file)
                          }}
                        />
                      )}
                      {uploadingDoc === 'drivers_license' && <span className="checkout-doc-loading">Uploading…</span>}
                    </label>
                  </div>
                </div>
                <div className="checkout-form__actions">
                  <button
                    type="button"
                    className="checkout-btn checkout-btn--secondary"
                    onClick={() => setStep(1)}
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    className="checkout-btn checkout-btn--primary"
                    disabled={!canProceedFromDocuments || !!uploadingDoc}
                  >
                    Proceed to Delivery
                  </button>
                </div>
              </form>
            )}

            {step === 3 && (
              <form className="checkout-form" onSubmit={handleConfirmBooking}>
                <div className="checkout-banner checkout-banner--info">
                  Your request is sent to the dealer for review. You are not charged until the dealer approves your
                  documents and booking. If they decline, you will see their reason under My Requests.
                </div>
                <div className="checkout-section">
                  <h3>Delivery Information</h3>
                  <label>
                    Delivery Location *
                    <input
                      type="text"
                      placeholder="e.g. 123 Main Street"
                      value={delivery.location}
                      onChange={(e) => setDelivery((d) => ({ ...d, location: e.target.value }))}
                      className={fieldErrors.location ? 'error' : ''}
                    />
                    {fieldErrors.location && <span className="field-error">{fieldErrors.location}</span>}
                  </label>
                </div>

                <div className="checkout-section">
                  <h3>Schedule Delivery</h3>
                  <div className="checkout-grid">
                    <label>
                      Date *
                      <input
                        type="date"
                        value={delivery.date}
                        onChange={(e) => setDelivery((d) => ({ ...d, date: e.target.value }))}
                        className={fieldErrors.date ? 'error' : ''}
                      />
                      {fieldErrors.date && <span className="field-error">{fieldErrors.date}</span>}
                    </label>
                    <label>
                      Time *
                      <input
                        type="time"
                        value={delivery.time}
                        onChange={(e) => setDelivery((d) => ({ ...d, time: e.target.value }))}
                        className={fieldErrors.time ? 'error' : ''}
                      />
                      {fieldErrors.time && <span className="field-error">{fieldErrors.time}</span>}
                    </label>
                  </div>
                </div>

                <div className="checkout-section checkout-section--pay-at-shop">
                  <h3><Store size={18} /> Payment</h3>
                  <p className="checkout-pay-at-shop-message">
                    No payment is taken now. After the dealer approves, you will complete payment (e.g. at pickup or as
                    instructed by the dealer). The total shown is an estimate until approval.
                  </p>
                </div>

                <div className="checkout-form__actions">
                  <button
                    type="button"
                    className="checkout-btn checkout-btn--secondary"
                    onClick={() => setStep(2)}
                  >
                    ← Back
                  </button>
                  <button type="submit" className="checkout-btn checkout-btn--primary" disabled={isProcessing}>
                    Confirm Booking
                  </button>
                </div>
              </form>
            )}
          </div>

          <aside className="checkout-sidebar">
            <div className="order-summary">
              <h4>Order Summary</h4>
              <div className="order-summary__row">
                <span>{cart.vehicleName}</span>
                <span>QAR {cart.subtotal.toLocaleString()}</span>
              </div>
              <div className="order-summary__row">
                <span>Tax</span>
                <span>QAR {cart.tax.toLocaleString()}</span>
              </div>
              <div className="order-summary__divider" />
              <div className="order-summary__row order-summary__row--total">
                <span>Total</span>
                <span>QAR {cart.total.toLocaleString()}</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <Footer />

      {isProcessing && <ProcessingOverlay />}
    </div>
  )
}
