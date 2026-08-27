import {
  computeFirstMonthDue,
  computeSubscriptionMonthly,
  checkoutDeliverySchema,
  checkoutFieldErrors,
  checkoutNoteSchema,
  DELIVERY_TIME_SLOTS,
  formatCurrency,
  SUBSCRIPTION_VALUE_PROPS,
  uploadCustomerDocument,
  type CustomerDocumentType,
} from '@carflow/shared'
import {
  CheckCircle2,
  FileText,
  Gift,
  IdCard,
  ListOrdered,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Truck,
  Upload,
  User,
} from 'lucide-react'
import type { FormEvent} from 'react';
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SubscriptionPricingSummary } from '../components/booking/SubscriptionPricingSummary'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import { ProcessingOverlay } from '../components/shared/ProcessingOverlay'
import { CHECKOUT_CONSENT_KINDS, LEGAL_ROUTES } from '../constants/legal'
import {
  SUPPORT_EMAIL,
  SUPPORT_PHONE_CONFIGURED,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_TEL,
} from '../constants/support'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../hooks/useToast'
import { t } from '../i18n'
import { ApiError, isTemporarilyUnavailable } from '@carflow/shared'
import { resendVerificationEmail } from '../services/authService'
import { recordConsentsSafely } from '../services/consentService'
import {
  createBookingRequest,
  getBillingAddress,
  getCustomerProfile,
  updateBillingAddress,
  updateCustomerDocuments,
  validatePromoCode,
  type PromoValidationResult,
} from '../services/customerService'
import { createSkipCashPaymentIntent } from '../services/paymentService'
import { useCartStore } from '../stores/cartStore'
import './CheckoutPage.css'

const MAX_FILE_BYTES = 10 * 1024 * 1024

export type { CartItem } from '../stores/cartStore'

export function CheckoutPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { cart, vehicle, clearCart } = useCartStore()
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendingVerification, setResendingVerification] = useState(false)
  const [profile, setProfile] = useState<{
    qid_document_path: string | null
    drivers_license_path: string | null
  } | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState<'qid' | 'drivers_license' | null>(null)
  const [documentError, setDocumentError] = useState('')
  const qidInputRef = useRef<HTMLInputElement>(null)
  const licenseInputRef = useRef<HTMLInputElement>(null)

  const [contact, setContact] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    qid: '',
    dateOfBirth: '',
    nationality: 'Qatari',
  })
  const [license, setLicense] = useState({
    number: '',
    expiry: '',
  })
  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'Qatar',
  })
  const [delivery, setDelivery] = useState<{
    mode: 'delivery' | 'dealer_pickup'
    location: string
    date: string
    time: (typeof DELIVERY_TIME_SLOTS)[number]
  }>({
    mode: 'delivery',
    location: '',
    date: cart?.startDate ?? '',
    time: DELIVERY_TIME_SLOTS[0],
  })
  const [emergency, setEmergency] = useState({
    name: '',
    phone: '',
  })
  const [paymentMethod, setPaymentMethod] = useState<'pay_at_shop' | 'skipcash_online'>('pay_at_shop')
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoResult, setPromoResult] = useState<PromoValidationResult | null>(null)
  const [promoError, setPromoError] = useState('')
  const [validatingPromo, setValidatingPromo] = useState(false)
  // Set when checkout finishes and we clear the cart ourselves: without it,
  // the empty-cart redirect below races (and can beat) the success navigation
  // to /my-booking, dumping the customer on /browse after booking.
  const leavingCheckoutRef = useRef(false)

  useEffect(() => {
    if (!cart && !leavingCheckoutRef.current) navigate('/browse', { replace: true })
  }, [cart, navigate])

  useEffect(() => {
    getCustomerProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
    getBillingAddress()
      .then((addr) => {
        if (addr.line1 || addr.city) {
          setAddress({
            street: addr.line1 || '',
            city: addr.city || '',
            state: addr.line2 || '',
            zip: addr.postalCode || '',
            country: addr.country || 'Qatar',
          })
        }
      })
      .catch(() => {
        /* no saved address yet */
      })
  }, [])

  useEffect(() => {
    if (!session) return
    const first = session.name.split(/\s+/)[0] || ''
    const last = session.name.split(/\s+/).slice(1).join(' ') || ''
    const email = session.email || ''
    setContact((c) => ({
      ...c,
      firstName: c.firstName || first,
      lastName: c.lastName || last,
      email: c.email || email,
    }))
  }, [session?.userId, session?.email, session?.name])

  useEffect(() => {
    if (cart?.startDate) {
      setDelivery((d) => ({ ...d, date: d.date || cart.startDate }))
    }
  }, [cart?.startDate])

  useEffect(() => {
    if (!cart?.notes) return
    try {
      const parsed = JSON.parse(cart.notes) as { paymentMethod?: 'pay_at_shop' | 'skipcash_online' }
      if (parsed.paymentMethod === 'pay_at_shop' || parsed.paymentMethod === 'skipcash_online') {
        setPaymentMethod(parsed.paymentMethod)
      }
    } catch {
      /* ignore non-JSON notes */
    }
  }, [cart?.notes])

  if (!cart) {
    return (
      <div className="checkout-page">
        <Header />
        <div className="checkout-empty">Redirecting…</div>
        <Footer />
      </div>
    )
  }

  const hasQid = !!profile?.qid_document_path
  const hasDriversLicense = !!profile?.drivers_license_path
  const savings = promoResult?.valid ? (promoResult.discountAmount ?? 0) : 0

  // Online payment charges the FIRST MONTH only (invygo-style monthly
  // subscription); the server bills the following months monthly.
  const monthlyAmount =
    vehicle && vehicle.id === cart.vehicleId && vehicle.pricePerDay
      ? computeSubscriptionMonthly(vehicle.pricePerDay, cart.durationMonths)
      : Math.round(cart.subtotal / Math.max(1, cart.durationMonths))

  const dueToday =
    vehicle && vehicle.id === cart.vehicleId && vehicle.pricePerDay
      ? computeFirstMonthDue(vehicle.pricePerDay, cart.durationMonths)
      : { monthly: monthlyAmount, total: monthlyAmount }

  const minimumTermTotal = cart.total

  // Same shape that is submitted as the booking note, so client validation
  // mirrors the server’s checkoutNoteSchema check exactly.
  const deliveryPayload = () =>
    delivery.mode === 'delivery'
      ? delivery
      : { mode: 'dealer_pickup', date: delivery.date, time: delivery.time }

  const validate = (): boolean => {
    const parsed = checkoutNoteSchema.safeParse({
      contact,
      license,
      delivery: deliveryPayload(),
    })
    const errs: Record<string, string> = parsed.success ? {} : checkoutFieldErrors(parsed.error)
    if (!hasQid) errs.qidDoc = 'Upload required'
    if (!hasDriversLicense) errs.licenseDoc = 'Upload required'
    if (!address.street.trim()) errs.street = 'Required'
    if (!address.city.trim()) errs.city = 'Required'
    if (!address.country.trim()) errs.country = 'Required'
    if (!acceptedLegal) errs.legalConsent = 'Accept the agreement to continue'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleDocumentUpload = async (type: CustomerDocumentType, file: File) => {
    setDocumentError('')
    if (type === 'qid') {
      const qidCheck = checkoutNoteSchema.shape.contact.shape.qid.safeParse(contact.qid)
      if (!qidCheck.success) {
        const msg = qidCheck.error.issues[0]?.message ?? 'Enter a valid QID number before uploading'
        setFieldErrors((prev) => ({ ...prev, qid: msg }))
        setDocumentError(msg)
        toast.error(msg)
        return
      }
    } else {
      const licenseCheck = checkoutNoteSchema.shape.license.shape.number.safeParse(license.number)
      if (!licenseCheck.success) {
        const msg = licenseCheck.error.issues[0]?.message ?? "Enter a valid license number before uploading"
        setFieldErrors((prev) => ({ ...prev, licenseNumber: msg }))
        setDocumentError(msg)
        toast.error(msg)
        return
      }
    }
    if (file.size > MAX_FILE_BYTES) {
      const msg = 'File must be 10MB or smaller.'
      setDocumentError(msg)
      toast.error(msg)
      return
    }
    setUploadingDoc(type === 'qid' ? 'qid' : 'drivers_license')
    try {
      const userId = session?.userId
      if (!userId) throw new Error('Not authenticated')
      const path = await uploadCustomerDocument(file, userId, type)
      const updated = await updateCustomerDocuments(
        type === 'qid'
          ? { qid_document_path: path, qid_number: contact.qid.trim() }
          : { drivers_license_path: path, drivers_license_number: license.number.trim() }
      )
      setProfile(updated)
      toast.success(type === 'qid' ? 'QID uploaded' : "Driver's license uploaded")
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setDocumentError(msg)
      toast.error(msg)
    } finally {
      setUploadingDoc(null)
    }
  }

  const handleApplyPromo = async () => {
    setPromoError('')
    setPromoResult(null)
    if (!promoCode.trim()) {
      setPromoError(t('checkout.promoInvalid'))
      return
    }
    setValidatingPromo(true)
    try {
      const result = await validatePromoCode({
        code: promoCode.trim(),
        termMonths: cart.durationMonths,
        vehicleId: cart.vehicleId,
      })
      if (!result.valid) {
        setPromoError(result.error ?? t('checkout.promoInvalid'))
        setPromoResult(null)
      } else {
        setPromoResult(result)
        toast.success(t('checkout.promoApplied'))
      }
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : t('checkout.promoInvalid'))
    } finally {
      setValidatingPromo(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!validate()) {
      setFormError('Please fix the highlighted fields and upload both documents.')
      return
    }
    setIsProcessing(true)
    const parsedContact = checkoutNoteSchema.shape.contact.parse(contact)
    const parsedLicense = checkoutNoteSchema.shape.license.parse(license)
    const parsedDelivery = checkoutDeliverySchema.parse(deliveryPayload())
    const note = JSON.stringify({
      duration: cart.durationLabel,
      durationMonths: cart.durationMonths,
      startDate: cart.startDate,
      quantity: cart.quantity,
      notes: cart.notes,
      contact: parsedContact,
      license: parsedLicense,
      address,
      delivery: parsedDelivery,
      emergency,
      paymentMethod,
      total: cart.total,
      promo: promoResult?.valid
        ? {
            code: promoResult.code,
            promoCodeId: promoResult.promoCodeId,
            discountAmount: promoResult.discountAmount,
          }
        : undefined,
    })
    try {
      // Filed before the gateway hand-off — the online path never comes back to
      // this component, so recording it after payment would lose the evidence.
      await recordConsentsSafely(CHECKOUT_CONSENT_KINDS)
      await updateBillingAddress({
        line1: address.street.trim(),
        line2: address.state.trim() || undefined,
        city: address.city.trim(),
        country: address.country.trim(),
        postalCode: address.zip.trim() || undefined,
      })
      if (paymentMethod === 'skipcash_online') {
        const intent = await createSkipCashPaymentIntent({
          vehicleId: cart.vehicleId,
          note,
          contact: {
            firstName: parsedContact.firstName,
            lastName: parsedContact.lastName,
            email: parsedContact.email,
            phone: parsedContact.phone,
          },
        })
        // The booking is now held server-side, so drop the cart before leaving
        // for the gateway — a stale cart caused double-pay attempts (BUG-05/§4).
        leavingCheckoutRef.current = true
        clearCart()
        window.location.href = intent.payUrl
        return
      }
      const booking = await createBookingRequest({
        vehicleId: cart.vehicleId,
        note,
      })
      leavingCheckoutRef.current = true
      clearCart()
      toast.success('Request submitted — pending dealer approval')
      navigate('/my-booking', {
        state: {
          justBooked: true,
          booking,
          vehicleName: cart.vehicleName,
          total: cart.total,
          startDate: cart.startDate,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to confirm booking.'
      if (err instanceof ApiError && err.status === 403 && /verify/i.test(msg)) {
        setNeedsVerification(true)
      }
      if (isTemporarilyUnavailable(err)) {
        setFormError('Online booking is temporarily paused. Please try again later or contact support.')
      } else {
        setFormError(msg)
      }
      toast.error(isTemporarilyUnavailable(err) ? 'Booking is temporarily paused' : msg)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleResendVerification = async () => {
    setResendingVerification(true)
    try {
      await resendVerificationEmail()
      toast.success('Verification email sent — check your inbox, then try again.')
      setNeedsVerification(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to resend the verification email')
    } finally {
      setResendingVerification(false)
    }
  }

  return (
    <div className="checkout-page">
      <Header />
      {isProcessing && <ProcessingOverlay />}

      <main className="checkout-main-wrap">
        <div className="checkout-layout">
          <form className="checkout-form-col" onSubmit={handleSubmit} noValidate>
            {formError && <div className="checkout-alert checkout-alert--error">{formError}</div>}
            {needsVerification && (
              <div className="checkout-alert checkout-alert--verify" role="alert">
                <span>Your email isn&apos;t verified yet, so online payment is blocked.</span>
                <button
                  type="button"
                  className="checkout-resend-btn"
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                >
                  {resendingVerification ? 'Sending…' : 'Resend verification email'}
                </button>
              </div>
            )}

            <section className="checkout-card">
              <h2 className="checkout-card__title">
                <User size={18} />
                Personal Information
              </h2>
              <div className="checkout-grid-2">
                <label className="checkout-field">
                  <span>First Name *</span>
                  <input
                    value={contact.firstName}
                    onChange={(e) => setContact((c) => ({ ...c, firstName: e.target.value }))}
                    className={fieldErrors.firstName ? 'is-error' : ''}
                  />
                  {fieldErrors.firstName ? (
                    <span className="checkout-field-error">{fieldErrors.firstName}</span>
                  ) : null}
                </label>
                <label className="checkout-field">
                  <span>Last Name *</span>
                  <input
                    value={contact.lastName}
                    onChange={(e) => setContact((c) => ({ ...c, lastName: e.target.value }))}
                    className={fieldErrors.lastName ? 'is-error' : ''}
                  />
                  {fieldErrors.lastName ? (
                    <span className="checkout-field-error">{fieldErrors.lastName}</span>
                  ) : null}
                </label>
                <label className="checkout-field">
                  <span>Email Address *</span>
                  <input
                    type="email"
                    value={contact.email}
                    onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                    className={fieldErrors.email ? 'is-error' : ''}
                  />
                  {fieldErrors.email ? (
                    <span className="checkout-field-error">{fieldErrors.email}</span>
                  ) : null}
                </label>
                <label className="checkout-field">
                  <span>Phone Number *</span>
                  <input
                    type="tel"
                    placeholder="+974 5555 1234"
                    value={contact.phone}
                    onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                    className={fieldErrors.phone ? 'is-error' : ''}
                  />
                  {fieldErrors.phone ? (
                    <span className="checkout-field-error">{fieldErrors.phone}</span>
                  ) : null}
                </label>
                <label className="checkout-field">
                  <span>Qatar ID (QID) Number *</span>
                  <input
                    inputMode="numeric"
                    placeholder="28412345678"
                    value={contact.qid}
                    onChange={(e) => setContact((c) => ({ ...c, qid: e.target.value }))}
                    className={fieldErrors.qid ? 'is-error' : ''}
                  />
                  {fieldErrors.qid ? <span className="checkout-field-error">{fieldErrors.qid}</span> : null}
                </label>
                <label className="checkout-field">
                  <span>Date of Birth *</span>
                  <input
                    type="date"
                    value={contact.dateOfBirth}
                    onChange={(e) => setContact((c) => ({ ...c, dateOfBirth: e.target.value }))}
                    className={fieldErrors.dateOfBirth ? 'is-error' : ''}
                  />
                  {fieldErrors.dateOfBirth ? (
                    <span className="checkout-field-error">{fieldErrors.dateOfBirth}</span>
                  ) : null}
                </label>
                <label className="checkout-field">
                  <span>Nationality *</span>
                  <select
                    value={contact.nationality}
                    onChange={(e) => setContact((c) => ({ ...c, nationality: e.target.value }))}
                    className={fieldErrors.nationality ? 'is-error' : ''}
                  >
                    <option value="Qatari">Qatari</option>
                    <option value="Other GCC">Other GCC</option>
                    <option value="Other">Other</option>
                  </select>
                  {fieldErrors.nationality ? (
                    <span className="checkout-field-error">{fieldErrors.nationality}</span>
                  ) : null}
                </label>
              </div>
            </section>

            <section className="checkout-card">
              <h2 className="checkout-card__title">
                <FileText size={18} />
                Driver&apos;s License Information
              </h2>
              <div className="checkout-grid-2">
                <label className="checkout-field">
                  <span>License Number *</span>
                  <input
                    inputMode="numeric"
                    placeholder="12345678"
                    value={license.number}
                    onChange={(e) => setLicense((l) => ({ ...l, number: e.target.value }))}
                    className={fieldErrors.licenseNumber ? 'is-error' : ''}
                  />
                  {fieldErrors.licenseNumber ? (
                    <span className="checkout-field-error">{fieldErrors.licenseNumber}</span>
                  ) : null}
                </label>
                <label className="checkout-field">
                  <span>License Expiry Date *</span>
                  <input
                    type="date"
                    value={license.expiry}
                    onChange={(e) => setLicense((l) => ({ ...l, expiry: e.target.value }))}
                    className={fieldErrors.licenseExpiry ? 'is-error' : ''}
                  />
                  {fieldErrors.licenseExpiry ? (
                    <span className="checkout-field-error">{fieldErrors.licenseExpiry}</span>
                  ) : null}
                </label>
              </div>

              <div className="checkout-info-box">
                <strong>License Requirements:</strong>
                <ul>
                  <li>Valid license for at least 2 years</li>
                  <li>International Driving Permit may be required</li>
                  <li>License must be valid for the entire rental period</li>
                </ul>
              </div>

              <h3 className="checkout-subtitle">Required Document Uploads</h3>
              {documentError && <p className="checkout-doc-error">{documentError}</p>}
              <div className="checkout-upload-grid">
                <div className={`checkout-upload-card ${hasQid ? 'is-done' : ''} ${fieldErrors.qidDoc ? 'is-error' : ''}`}>
                  <div className="checkout-upload-card__top">
                    <span>Qatar ID (QID) *</span>
                    <span className={`checkout-badge ${hasQid ? 'done' : ''}`}>
                      {hasQid ? 'Uploaded' : 'Upload Required'}
                    </span>
                  </div>
                  <IdCard size={28} className="checkout-upload-card__icon" />
                  <p className="checkout-upload-card__label">{hasQid ? 'QID on file' : 'Upload QID'}</p>
                  <p className="checkout-upload-card__hint">Front and back of Qatar ID</p>
                  <input
                    ref={qidInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleDocumentUpload('qid', file)
                    }}
                  />
                  <button
                    type="button"
                    className="checkout-choose-file"
                    disabled={uploadingDoc === 'qid'}
                    onClick={() => qidInputRef.current?.click()}
                  >
                    <Upload size={14} />
                    {uploadingDoc === 'qid' ? 'Uploading…' : 'Choose File'}
                  </button>
                  <p className="checkout-upload-card__formats">JPG, PNG, PDF · Max 10MB</p>
                  {fieldErrors.qidDoc ? (
                    <span className="checkout-field-error">{fieldErrors.qidDoc}</span>
                  ) : null}
                </div>

                <div
                  className={`checkout-upload-card ${hasDriversLicense ? 'is-done' : ''} ${fieldErrors.licenseDoc ? 'is-error' : ''}`}
                >
                  <div className="checkout-upload-card__top">
                    <span>Driver&apos;s License *</span>
                    <span className={`checkout-badge ${hasDriversLicense ? 'done' : ''}`}>
                      {hasDriversLicense ? 'Uploaded' : 'Upload Required'}
                    </span>
                  </div>
                  <FileText size={28} className="checkout-upload-card__icon" />
                  <p className="checkout-upload-card__label">
                    {hasDriversLicense ? 'License on file' : 'Upload License'}
                  </p>
                  <p className="checkout-upload-card__hint">Valid driver&apos;s license</p>
                  <input
                    ref={licenseInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleDocumentUpload('drivers_license', file)
                    }}
                  />
                  <button
                    type="button"
                    className="checkout-choose-file"
                    disabled={uploadingDoc === 'drivers_license'}
                    onClick={() => licenseInputRef.current?.click()}
                  >
                    <Upload size={14} />
                    {uploadingDoc === 'drivers_license' ? 'Uploading…' : 'Choose File'}
                  </button>
                  <p className="checkout-upload-card__formats">JPG, PNG, PDF · Max 10MB</p>
                  {fieldErrors.licenseDoc ? (
                    <span className="checkout-field-error">{fieldErrors.licenseDoc}</span>
                  ) : null}
                </div>
              </div>

              <div className="checkout-secure-banner">
                <ShieldCheck size={16} />
                Your documents are encrypted and secure. We only use them for verification purposes.
              </div>
            </section>

            <section className="checkout-card">
              <h2 className="checkout-card__title">
                <MapPin size={18} />
                Billing Address
              </h2>
              <label className="checkout-field">
                <span>Street Address *</span>
                <input
                  value={address.street}
                  onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
                  className={fieldErrors.street ? 'is-error' : ''}
                />
              </label>
              <div className="checkout-grid-3">
                <label className="checkout-field">
                  <span>City *</span>
                  <input
                    value={address.city}
                    onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                    className={fieldErrors.city ? 'is-error' : ''}
                  />
                </label>
                <label className="checkout-field">
                  <span>State/Province</span>
                  <input
                    value={address.state}
                    onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))}
                  />
                </label>
                <label className="checkout-field">
                  <span>ZIP/Postal Code</span>
                  <input
                    value={address.zip}
                    onChange={(e) => setAddress((a) => ({ ...a, zip: e.target.value }))}
                  />
                </label>
              </div>
              <label className="checkout-field">
                <span>Country *</span>
                <select
                  value={address.country}
                  onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))}
                >
                  <option value="Qatar">Qatar</option>
                  <option value="UAE">UAE</option>
                  <option value="Saudi Arabia">Saudi Arabia</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            </section>

            <section className="checkout-card">
              <h2 className="checkout-card__title">
                <Truck size={18} />
                Delivery &amp; pickup
              </h2>
              <p className="checkout-delivery-hint">
                Choose free delivery to your address or collect the vehicle from the dealer. This is
                separate from your billing address.
              </p>
              <div className="checkout-delivery-modes">
                <label className="checkout-payment">
                  <input
                    type="radio"
                    name="deliveryMode"
                    checked={delivery.mode === 'delivery'}
                    onChange={() => setDelivery((d) => ({ ...d, mode: 'delivery' }))}
                  />
                  <span>
                    <strong>Deliver to my address</strong>
                    <small>We&apos;ll bring the car to you at your chosen slot</small>
                  </span>
                </label>
                <label className="checkout-payment">
                  <input
                    type="radio"
                    name="deliveryMode"
                    checked={delivery.mode === 'dealer_pickup'}
                    onChange={() => setDelivery((d) => ({ ...d, mode: 'dealer_pickup' }))}
                  />
                  <span>
                    <strong>Collect from dealer</strong>
                    <small>Pick up the vehicle at the dealer location</small>
                  </span>
                </label>
              </div>
              {delivery.mode === 'delivery' && (
                <label className="checkout-field">
                  <span>Delivery address *</span>
                  <input
                    value={delivery.location}
                    onChange={(e) => setDelivery((d) => ({ ...d, location: e.target.value }))}
                    placeholder="Building, street, area, city"
                    className={fieldErrors.deliveryLocation ? 'is-error' : ''}
                  />
                  {fieldErrors.deliveryLocation ? (
                    <span className="checkout-field-error">{fieldErrors.deliveryLocation}</span>
                  ) : null}
                </label>
              )}
              <div className="checkout-grid-2">
                <label className="checkout-field">
                  <span>Preferred date *</span>
                  <input
                    type="date"
                    value={delivery.date}
                    min={cart.startDate}
                    onChange={(e) => setDelivery((d) => ({ ...d, date: e.target.value }))}
                    className={fieldErrors.deliveryDate ? 'is-error' : ''}
                  />
                  {fieldErrors.deliveryDate ? (
                    <span className="checkout-field-error">{fieldErrors.deliveryDate}</span>
                  ) : null}
                </label>
                <label className="checkout-field">
                  <span>Preferred time slot *</span>
                  <select
                    value={delivery.time}
                    onChange={(e) =>
                      setDelivery((d) => ({
                        ...d,
                        time: e.target.value as (typeof DELIVERY_TIME_SLOTS)[number],
                      }))
                    }
                    className={fieldErrors.deliveryTime ? 'is-error' : ''}
                  >
                    {DELIVERY_TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.deliveryTime ? (
                    <span className="checkout-field-error">{fieldErrors.deliveryTime}</span>
                  ) : null}
                </label>
              </div>
            </section>

            <section className="checkout-card">
              <h2 className="checkout-card__title">
                <Phone size={18} />
                Emergency Contact
              </h2>
              <div className="checkout-grid-2">
                <label className="checkout-field">
                  <span>Emergency Contact Name</span>
                  <input
                    value={emergency.name}
                    onChange={(e) => setEmergency((em) => ({ ...em, name: e.target.value }))}
                  />
                </label>
                <label className="checkout-field">
                  <span>Emergency Phone Number</span>
                  <input
                    type="tel"
                    placeholder="+974"
                    value={emergency.phone}
                    onChange={(e) => setEmergency((em) => ({ ...em, phone: e.target.value }))}
                  />
                </label>
              </div>
            </section>

            <section className="checkout-card">
              <h2 className="checkout-card__title">Payment</h2>
              <div className="checkout-promo">
                <label className="checkout-field checkout-promo__field">
                  <span>{t('checkout.promo')}</span>
                  <div className="checkout-promo__row">
                    <input
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value)
                        setPromoError('')
                        setPromoResult(null)
                      }}
                      placeholder="Enter code"
                    />
                    <button
                      type="button"
                      className="checkout-promo__apply"
                      disabled={validatingPromo}
                      onClick={() => void handleApplyPromo()}
                    >
                      {validatingPromo ? '…' : t('checkout.promoApply')}
                    </button>
                  </div>
                </label>
                {promoError && <p className="checkout-promo__error">{promoError}</p>}
                {promoResult?.valid && promoResult.discountAmount ? (
                  <p className="checkout-promo__success">
                    {t('checkout.promoApplied')} — {formatCurrency(promoResult.discountAmount)} off
                  </p>
                ) : null}
              </div>
              <label className="checkout-payment">
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
              <label className="checkout-payment">
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'skipcash_online'}
                  onChange={() => setPaymentMethod('skipcash_online')}
                />
                <span>
                  <strong>Pay now with card</strong>
                  <small>
                    Secure online payment via SkipCash — {formatCurrency(monthlyAmount)} charged now
                    for your first month, then {formatCurrency(monthlyAmount)}/month
                  </small>
                </span>
              </label>
            </section>

            <section className="checkout-card checkout-consent">
              <label className="checkout-consent__row">
                <input
                  type="checkbox"
                  checked={acceptedLegal}
                  onChange={(e) => {
                    setAcceptedLegal(e.target.checked)
                    if (e.target.checked) {
                      setFieldErrors((prev) => {
                        if (!prev.legalConsent) return prev
                        const next = { ...prev }
                        delete next.legalConsent
                        return next
                      })
                    }
                  }}
                  required
                />
                <span>
                  I accept the{' '}
                  <Link to={LEGAL_ROUTES.rental_agreement} target="_blank" rel="noreferrer">
                    Subscription Agreement
                  </Link>
                  , the{' '}
                  <Link to={LEGAL_ROUTES.terms} target="_blank" rel="noreferrer">
                    Terms of Service
                  </Link>
                  , the{' '}
                  <Link to={LEGAL_ROUTES.refund_policy} target="_blank" rel="noreferrer">
                    Cancellation &amp; Refund Policy
                  </Link>{' '}
                  and the{' '}
                  <Link to={LEGAL_ROUTES.privacy} target="_blank" rel="noreferrer">
                    Privacy Notice
                  </Link>
                  . I authorise the first-month charge and the recurring monthly subscription charge
                  described in the order summary.
                </span>
              </label>
              {fieldErrors.legalConsent && (
                <p className="checkout-consent__error">{fieldErrors.legalConsent}</p>
              )}
            </section>

            <div className="checkout-actions">
              <Link to={`/car/${cart.vehicleId}`} className="checkout-back-link">
                ← Back to car
              </Link>
              <button
                type="submit"
                className="checkout-continue"
                disabled={isProcessing || !acceptedLegal}
              >
                Continue
              </button>
            </div>
          </form>

          <aside className="checkout-sidebar">
            <section className="checkout-card checkout-summary">
              <h2 className="checkout-card__title">
                <ListOrdered size={18} />
                Order Summary
              </h2>
              <p className="checkout-summary__car">{cart.vehicleName}</p>
              <p className="checkout-summary__meta">
                {cart.durationMonths}-month minimum · Start {cart.startDate}
              </p>
              <SubscriptionPricingSummary
                monthly={monthlyAmount}
                firstMonthTotal={Math.max(0, dueToday.total - savings)}
                durationMonths={cart.durationMonths}
                minimumTermTotal={Math.max(0, minimumTermTotal - savings)}
              />
              {paymentMethod === 'skipcash_online' && (
                <p className="checkout-summary__renewal">
                  Then {formatCurrency(dueToday.monthly)}/month — rolling subscription after your{' '}
                  {cart.durationMonths}-month minimum.
                </p>
              )}
              {savings > 0 && (
                <div className="checkout-savings">
                  <Gift size={16} />
                  You saved {formatCurrency(savings)}!
                </div>
              )}
              <ul className="checkout-trust">
                {SUBSCRIPTION_VALUE_PROPS.map((line) => (
                  <li key={line}>
                    <CheckCircle2 size={16} /> {line}
                  </li>
                ))}
              </ul>
            </section>

            <section className="checkout-card checkout-help">
              <h3>Need Help?</h3>
              <p>Our customer support team is here to assist you</p>
              {SUPPORT_PHONE_CONFIGURED && (
                <a className="checkout-help-btn" href={`tel:${SUPPORT_PHONE_TEL}`}>
                  <Phone size={16} />
                  Call {SUPPORT_PHONE_DISPLAY}
                </a>
              )}
              <a className="checkout-help-btn" href={`mailto:${SUPPORT_EMAIL}`}>
                <Mail size={16} />
                Email Us
              </a>
            </section>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  )
}
