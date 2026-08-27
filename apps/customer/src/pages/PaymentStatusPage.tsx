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

const FAST_POLL_INTERVAL_MS = 2000
const SLOW_POLL_INTERVAL_MS = 5000
/** Poll quickly while the customer is likely still watching this tab. */
const FAST_POLL_WINDOW_MS = 60 * 1000
/**
 * A 3DS/OTP round-trip on a Qatari card routinely runs into minutes, and the
 * SkipCash webhook lands after that. The old 30-second budget declared a
 * timeout mid-flow and then offered "Try again" — a second real charge for
 * money that was about to be captured.
 */
const POLL_BUDGET_MS = 6 * 60 * 1000

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
  const pollingStartedAt = useRef(Date.now())
  const cartCleared = useRef(false)
  const cartRestored = useRef(false)

  useEffect(() => {
    if (!paymentId) return
    let cancelled = false
    pollingStartedAt.current = Date.now()

    const poll = async () => {
      try {
        const result = await getSkipCashPaymentStatus(paymentId)
        if (cancelled) return
        setPayment(result)
        if (result.status === 'pending') {
          const elapsed = Date.now() - pollingStartedAt.current
          if (elapsed >= POLL_BUDGET_MS) {
            setTimedOut(true)
            return
          }
          setTimeout(
            poll,
            elapsed < FAST_POLL_WINDOW_MS ? FAST_POLL_INTERVAL_MS : SLOW_POLL_INTERVAL_MS
          )
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

  // Only on a definite failure. Rehydrating the cart after a *timeout* would
  // put the car back in checkout while the original payment may still be
  // completing, inviting a duplicate booking and a duplicate charge.
  useEffect(() => {
    if (!payment || cartRestored.current) return
    if (payment.status !== 'failed') return
    if (!isRentalPayment(payment) || !payment.vehicleId) return
    cartRestored.current = true
    void restoreCheckoutCartFromNote(payment.note, payment.vehicleId, setVehicle, setCart)
  }, [payment, setCart, setVehicle])

  const handleRetry = useCallback(async () => {
    if (!paymentId || retrying) return
    setRetryError('')
    setRetrying(true)
    try {
      const intent = await retrySkipCashPayment(paymentId)
      setSearchParams({ paymentId: intent.paymentId }, { replace: true })
      setPayment(null)
      setTimedOut(false)
      pollingStartedAt.current = Date.now()
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

  // Retry is only ever offered on a *confirmed* failure. While a payment is
  // unresolved, restarting it can charge the card a second time.
  const showRetry = payment.canRetry !== false && payment.status === 'failed'

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
      <h2>We are still confirming your payment</h2>
      <p>
        Your bank has not confirmed this payment yet. Please don&apos;t pay again — if the charge
        went through, your booking appears in My booking shortly and we email you either way.
      </p>
      <div className="payment-status-actions">
        <Link className="btn-primary" to="/my-booking">
          My booking
        </Link>
        <Link className="btn-secondary" to="/contact">
          Contact support
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
