import { Check, Clock, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import {
  getSkipCashPaymentStatus,
  retrySkipCashPayment,
  type SkipCashPaymentStatus,
} from '../services/paymentService'
import { useCartStore } from '../stores/cartStore'
import {
  clearInvoicePaymentAttempt,
  isRentalPayment,
  isSubscriptionPayment,
  restoreCheckoutCartFromNote,
} from '../utils/paymentRetry'
import './PaymentStatusPage.css'

const POLL_INTERVAL_MS = 2000
const MAX_ATTEMPTS = 15

export function PaymentStatusPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const paymentId = searchParams.get('paymentId')
  const clearCart = useCartStore((s) => s.clearCart)
  const setCart = useCartStore((s) => s.setCart)
  const setVehicle = useCartStore((s) => s.setVehicle)
  const [payment, setPayment] = useState<SkipCashPaymentStatus | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState('')
  const attempts = useRef(0)
  const cartCleared = useRef(false)
  const cartRestored = useRef(false)

  useEffect(() => {
    if (!paymentId) return
    let cancelled = false

    const poll = async () => {
      try {
        const result = await getSkipCashPaymentStatus(paymentId)
        if (cancelled) return
        setPayment(result)
        if (result.status === 'pending') {
          attempts.current += 1
          if (attempts.current >= MAX_ATTEMPTS) {
            setTimedOut(true)
            return
          }
          setTimeout(poll, POLL_INTERVAL_MS)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to check payment status')
      }
    }

    poll()
    return () => {
      cancelled = true
    }
  }, [paymentId])

  useEffect(() => {
    if (payment?.status !== 'completed' || cartCleared.current) return
    cartCleared.current = true
    clearCart()
    clearInvoicePaymentAttempt()
  }, [payment?.status, clearCart])

  useEffect(() => {
    if (!payment || cartRestored.current) return
    if (payment.status !== 'failed' && !timedOut) return
    if (!isRentalPayment(payment) || !payment.vehicleId) return
    cartRestored.current = true
    void restoreCheckoutCartFromNote(payment.note, payment.vehicleId, setVehicle, setCart)
  }, [payment, timedOut, setCart, setVehicle])

  const handleRetry = useCallback(async () => {
    if (!paymentId || retrying) return
    setRetryError('')
    setRetrying(true)
    try {
      const intent = await retrySkipCashPayment(paymentId)
      setSearchParams({ paymentId: intent.paymentId }, { replace: true })
      setPayment(null)
      setTimedOut(false)
      attempts.current = 0
      window.location.href = intent.payUrl
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Unable to restart payment')
      setRetrying(false)
    }
  }, [paymentId, retrying, setSearchParams])

  if (!paymentId) {
    return (
      <PaymentStatusLayout>
        <p>
          No payment reference found. <Link to="/browse">Browse cars</Link>.
        </p>
      </PaymentStatusLayout>
    )
  }

  if (error) {
    return (
      <PaymentStatusLayout>
        <div className="payment-status-icon payment-status-icon--failed">
          <X size={40} strokeWidth={2.5} />
        </div>
        <h2>Something went wrong</h2>
        <p>{error}</p>
        <Link className="btn-primary" to="/my-booking">
          My booking
        </Link>
      </PaymentStatusLayout>
    )
  }

  if (!payment || (payment.status === 'pending' && !timedOut)) {
    return (
      <PaymentStatusLayout>
        <div className="payment-status-icon payment-status-icon--pending">
          <Clock size={40} strokeWidth={2.5} />
        </div>
        <h2>Confirming your payment&hellip;</h2>
        <p>This usually takes a few seconds. Please don&apos;t close this page.</p>
      </PaymentStatusLayout>
    )
  }

  if (payment.status === 'completed') {
    const bookingId = payment.bookingRequestId
      ? `CRN#${payment.bookingRequestId.slice(0, 8).toUpperCase()}`
      : undefined
    return (
      <PaymentStatusLayout>
        <div className="payment-status-icon payment-status-icon--success">
          <Check size={40} strokeWidth={2.5} />
        </div>
        <h2>Payment successful</h2>
        <p>Your request has been sent to the dealer. Track progress in My booking.</p>
        {bookingId && <p className="payment-status-booking-id">Booking ID: {bookingId}</p>}
        <div className="payment-status-actions">
          <Link className="btn-primary" to="/my-booking">
            My booking
          </Link>
          <Link className="btn-secondary" to="/browse">
            Browse cars
          </Link>
        </div>
      </PaymentStatusLayout>
    )
  }

  const showRetry = payment.canRetry !== false && (payment.status === 'failed' || timedOut)

  if (payment.status === 'failed') {
    return (
      <PaymentStatusLayout>
        <div className="payment-status-icon payment-status-icon--failed">
          <X size={40} strokeWidth={2.5} />
        </div>
        <h2>Payment failed</h2>
        <p>
          {isSubscriptionPayment(payment)
            ? 'Your invoice payment did not complete. You have not been charged — you can try again with one tap.'
            : 'Your payment did not complete. Your booking details are saved — you can try again without re-entering documents.'}
        </p>
        {retryError && <p className="payment-status-error">{retryError}</p>}
        <div className="payment-status-actions">
          {showRetry && (
            <button
              type="button"
              className="btn-primary payment-status-retry"
              disabled={retrying}
              onClick={() => void handleRetry()}
            >
              {retrying ? (
                <>
                  <Loader2 size={16} className="payment-status-spinner" aria-hidden />
                  Restarting…
                </>
              ) : (
                'Try again'
              )}
            </button>
          )}
          <Link className="btn-secondary" to="/my-booking">
            My booking
          </Link>
        </div>
      </PaymentStatusLayout>
    )
  }

  return (
    <PaymentStatusLayout>
      <div className="payment-status-icon payment-status-icon--pending">
        <Clock size={40} strokeWidth={2.5} />
      </div>
      <h2>Still processing</h2>
      <p>
        Your payment is taking longer than usual. You can wait a little longer or try the payment
        again — we&apos;ll reuse your saved booking details.
      </p>
      {retryError && <p className="payment-status-error">{retryError}</p>}
      <div className="payment-status-actions">
        {showRetry && (
          <button
            type="button"
            className="btn-primary payment-status-retry"
            disabled={retrying}
            onClick={() => void handleRetry()}
          >
            {retrying ? (
              <>
                <Loader2 size={16} className="payment-status-spinner" aria-hidden />
                Restarting…
              </>
            ) : (
              'Try again'
            )}
          </button>
        )}
        <Link className="btn-secondary" to="/my-booking">
          My booking
        </Link>
      </div>
    </PaymentStatusLayout>
  )
}

function PaymentStatusLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="payment-status-page">
      <Header />
      <div className="payment-status-content">{children}</div>
      <Footer />
    </div>
  )
}
