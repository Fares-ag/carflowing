import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { getSkipCashPaymentStatus, type SkipCashPaymentStatus } from '../services/paymentService'
import { useCartStore } from '../stores/cartStore'
import { Check, Clock, X } from 'lucide-react'
import './PaymentStatusPage.css'

const POLL_INTERVAL_MS = 2000
const MAX_ATTEMPTS = 15

export function PaymentStatusPage() {
  const [searchParams] = useSearchParams()
  const paymentId = searchParams.get('paymentId')
  const clearCart = useCartStore((s) => s.clearCart)
  const [payment, setPayment] = useState<SkipCashPaymentStatus | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [error, setError] = useState('')
  const attempts = useRef(0)
  const cartCleared = useRef(false)

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

  // Clear cart only after a confirmed successful payment (keep cart if user cancels/fails).
  useEffect(() => {
    if (payment?.status !== 'completed' || cartCleared.current) return
    cartCleared.current = true
    clearCart()
  }, [payment?.status, clearCart])

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

  if (payment.status === 'failed') {
    return (
      <PaymentStatusLayout>
        <div className="payment-status-icon payment-status-icon--failed">
          <X size={40} strokeWidth={2.5} />
        </div>
        <h2>Payment failed</h2>
        <p>Your payment was not completed, so no booking request was created. You have not been charged.</p>
        <Link className="btn-primary" to="/browse">
          Browse cars
        </Link>
      </PaymentStatusLayout>
    )
  }

  return (
    <PaymentStatusLayout>
      <div className="payment-status-icon payment-status-icon--pending">
        <Clock size={40} strokeWidth={2.5} />
      </div>
      <h2>Still processing</h2>
      <p>Your payment is taking longer than usual. Check My booking shortly, or contact support if this persists.</p>
      <Link className="btn-primary" to="/my-booking">
        My booking
      </Link>
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
