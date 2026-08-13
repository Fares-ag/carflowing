import { useState, FormEvent, useEffect, useRef } from 'react'
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
import { createSkipCashPaymentIntent } from '../services/paymentService'
import { formatCurrency, formatTaxRatePercent, uploadCustomerDocument, type CustomerDocumentType } from '@carflow/shared'
import { useAuth } from '../contexts/AuthContext'
import {
  SUPPORT_EMAIL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_TEL,
} from '../constants/support'
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
  Upload,
  User,
} from 'lucide-react'
import './CheckoutPage.css'

const MAX_FILE_BYTES = 10 * 1024 * 1024

export type { CartItem } from '../stores/cartStore'

export function CheckoutPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { cart, clearCart } = useCartStore()
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isProcessing, setIsProcessing] = useState(false)
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
  const [emergency, setEmergency] = useState({
    name: '',
    phone: '',
  })
  const [paymentMethod, setPaymentMethod] = useState<'pay_at_shop' | 'skipcash_online'>('pay_at_shop')

  useEffect(() => {
    if (!cart) navigate('/browse', { replace: true })
  }, [cart, navigate])

  useEffect(() => {
    getCustomerProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
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
  const savings = 0

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!contact.firstName.trim()) errs.firstName = 'Required'
    if (!contact.lastName.trim()) errs.lastName = 'Required'
    if (!contact.email.trim()) errs.email = 'Required'
    if (!contact.phone.trim()) errs.phone = 'Required'
    if (!contact.dateOfBirth.trim()) errs.dateOfBirth = 'Required'
    if (!contact.nationality.trim()) errs.nationality = 'Required'
    if (!license.number.trim()) errs.licenseNumber = 'Required'
    if (!license.expiry.trim()) errs.licenseExpiry = 'Required'
    if (!address.street.trim()) errs.street = 'Required'
    if (!address.city.trim()) errs.city = 'Required'
    if (!address.country.trim()) errs.country = 'Required'
    if (!hasQid) errs.qid = 'Upload required'
    if (!hasDriversLicense) errs.licenseDoc = 'Upload required'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleDocumentUpload = async (type: CustomerDocumentType, file: File) => {
    setDocumentError('')
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
        type === 'qid' ? { qid_document_path: path } : { drivers_license_path: path }
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!validate()) {
      setFormError('Please complete all required fields and upload both documents.')
      return
    }
    setIsProcessing(true)
    const note = JSON.stringify({
      duration: cart.durationLabel,
      durationMonths: cart.durationMonths,
      startDate: cart.startDate,
      quantity: cart.quantity,
      notes: cart.notes,
      contact,
      license,
      address,
      emergency,
      paymentMethod,
      total: cart.total,
    })
    try {
      if (paymentMethod === 'skipcash_online') {
        const intent = await createSkipCashPaymentIntent({
          vehicleId: cart.vehicleId,
          note,
          contact: {
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phone: contact.phone,
          },
        })
        window.location.href = intent.payUrl
        return
      }
      const booking = await createBookingRequest({
        vehicleId: cart.vehicleId,
        note,
      })
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
      setFormError(msg)
      toast.error(msg)
    } finally {
      setIsProcessing(false)
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
                </label>
                <label className="checkout-field">
                  <span>Last Name *</span>
                  <input
                    value={contact.lastName}
                    onChange={(e) => setContact((c) => ({ ...c, lastName: e.target.value }))}
                    className={fieldErrors.lastName ? 'is-error' : ''}
                  />
                </label>
                <label className="checkout-field">
                  <span>Email Address *</span>
                  <input
                    type="email"
                    value={contact.email}
                    onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                    className={fieldErrors.email ? 'is-error' : ''}
                  />
                </label>
                <label className="checkout-field">
                  <span>Phone Number *</span>
                  <input
                    type="tel"
                    placeholder="+974"
                    value={contact.phone}
                    onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                    className={fieldErrors.phone ? 'is-error' : ''}
                  />
                </label>
                <label className="checkout-field">
                  <span>Date of Birth *</span>
                  <input
                    type="date"
                    value={contact.dateOfBirth}
                    onChange={(e) => setContact((c) => ({ ...c, dateOfBirth: e.target.value }))}
                    className={fieldErrors.dateOfBirth ? 'is-error' : ''}
                  />
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
                    value={license.number}
                    onChange={(e) => setLicense((l) => ({ ...l, number: e.target.value }))}
                    className={fieldErrors.licenseNumber ? 'is-error' : ''}
                  />
                </label>
                <label className="checkout-field">
                  <span>License Expiry Date *</span>
                  <input
                    type="date"
                    value={license.expiry}
                    onChange={(e) => setLicense((l) => ({ ...l, expiry: e.target.value }))}
                    className={fieldErrors.licenseExpiry ? 'is-error' : ''}
                  />
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
                <div className={`checkout-upload-card ${hasQid ? 'is-done' : ''} ${fieldErrors.qid ? 'is-error' : ''}`}>
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
                  <small>Secure online payment via SkipCash</small>
                </span>
              </label>
            </section>

            <div className="checkout-actions">
              <Link to={`/car/${cart.vehicleId}`} className="checkout-back-link">
                ← Back to car
              </Link>
              <button type="submit" className="checkout-continue" disabled={isProcessing}>
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
                {cart.durationLabel} · Start {cart.startDate}
              </p>
              <div className="checkout-summary__rows">
                <div>
                  <span>Subtotal (1 car)</span>
                  <span>{formatCurrency(cart.subtotal)}</span>
                </div>
                {savings > 0 && (
                  <div className="is-discount">
                    <span>Discount Applied</span>
                    <span>-{formatCurrency(savings)}</span>
                  </div>
                )}
                <div>
                  <span>Tax ({formatTaxRatePercent()})</span>
                  <span>{formatCurrency(cart.tax)}</span>
                </div>
              </div>
              <div className="checkout-summary__total">
                <span>Total</span>
                <strong>{formatCurrency(cart.total)}</strong>
              </div>
              {savings > 0 && (
                <div className="checkout-savings">
                  <Gift size={16} />
                  You saved {formatCurrency(savings)}!
                </div>
              )}
              <ul className="checkout-trust">
                <li>
                  <CheckCircle2 size={16} /> Free cancellation up to 24 hours
                </li>
                <li>
                  <CheckCircle2 size={16} /> 24/7 customer support
                </li>
                <li>
                  <CheckCircle2 size={16} /> Verified dealers only
                </li>
                <li>
                  <CheckCircle2 size={16} /> Secure payment processing
                </li>
              </ul>
            </section>

            <section className="checkout-card checkout-help">
              <h3>Need Help?</h3>
              <p>Our customer support team is here to assist you</p>
              <a className="checkout-help-btn" href={`tel:${SUPPORT_PHONE_TEL}`}>
                <Phone size={16} />
                Call {SUPPORT_PHONE_DISPLAY}
              </a>
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
