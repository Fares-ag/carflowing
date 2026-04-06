import { Link, useLocation } from 'react-router-dom'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { Check, Download, HelpCircle } from 'lucide-react'
import type { CartItem } from '../stores/cartStore'
import type { BookingRequest } from '@carflow/shared'
import './BookingConfirmedPage.css'

export function BookingConfirmedPage() {
  const location = useLocation()
  const state = location.state as {
    booking?: BookingRequest
    cart?: CartItem
    delivery?: { location: string; date: string; time: string }
    paymentDisplay?: string
  } | undefined
  const booking = state?.booking
  const cart = state?.cart
  const delivery = state?.delivery
  const paymentDisplay = state?.paymentDisplay ?? 'Pay at Shop'

  if (!booking || !cart) {
    return (
      <div className="booking-confirmed-page">
        <Header />
        <div className="booking-confirmed-content">
          <p>No booking details found. <Link to="/">Return home</Link>.</p>
        </div>
        <Footer />
      </div>
    )
  }

  const bookingId = `CRN#${booking.id.slice(0, 8).toUpperCase()}`

  return (
    <div className="booking-confirmed-page">
      <Header />

      <section className="booking-confirmed-header">
        <div className="booking-confirmed-header__inner">
          <h1>Request submitted</h1>
        </div>
      </section>

      <section className="booking-confirmed-content">
        <div className="booking-confirmed-content__inner">
          <div className="booking-confirmed-success">
            <div className="booking-confirmed-icon">
              <Check size={48} strokeWidth={2.5} />
            </div>
            <h2>We&apos;ve received your request</h2>
            <p className="booking-confirmed-message">
              Your request for {cart.vehicleName} is pending dealer review. You have not been charged yet. When the
              dealer approves your documents, you will be able to proceed with payment as agreed. If they decline, you
              will see their reason under My Requests.
            </p>

            <div className="booking-confirmed-summary">
              <div className="booking-confirmed-total">
                <span className="label">Estimated total (after approval)</span>
                <span className="value">QAR {cart.total.toLocaleString()}</span>
              </div>
              <div className="booking-confirmed-id">
                <span className="label">Booking ID</span>
                <span className="value">{bookingId}</span>
              </div>
              <div className="booking-confirmed-actions">
                <Link to="/requests" className="btn-primary">
                  View Booking
                </Link>
                <Link to="/" className="btn-secondary">
                  Back to Home
                </Link>
              </div>
            </div>

            <div className="booking-confirmed-details">
              <div className="detail-row">
                <span className="detail-label">Pickup Location & Date/Time</span>
                <span className="detail-value">{delivery?.location || '—'}</span>
                <span className="detail-value">{delivery?.date ?? cart.startDate} - {delivery?.time ?? '10:00 AM'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Return Location & Date/Time</span>
                <span className="detail-value">{delivery?.location || '—'}</span>
                <span className="detail-value">{delivery?.date ?? cart.startDate} - {delivery?.time ?? '10:00 AM'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Payment</span>
                <span className="detail-value">{paymentDisplay} (after dealer approval)</span>
                <span className="detail-value">QAR {cart.total.toLocaleString()} est.</span>
              </div>
            </div>

            <div className="booking-confirmed-help">
              <HelpCircle size={18} />
              <div>
                <strong>Need Help?</strong>
                <div>
                  <Link to="/contact">Contact Us</Link>
                  {' · '}
                  <Link to="/faqs">FAQs</Link>
                </div>
              </div>
            </div>
          </div>

          <aside className="booking-confirmed-invoice">
            <div className="invoice-card">
              <h3>Invoice</h3>
              <div className="invoice-row">
                <span>Invoice ID</span>
                <span>{bookingId}</span>
              </div>
              <div className="invoice-row">
                <span>Date</span>
                <span>{new Date().toLocaleDateString()}</span>
              </div>
              <div className="invoice-row">
                <span>Customer</span>
                <span>Customer</span>
              </div>
              <div className="invoice-divider" />
              <div className="invoice-row">
                <span>{cart.vehicleName} Rental</span>
                <span>QAR {cart.subtotal.toLocaleString()}</span>
              </div>
              <div className="invoice-row">
                <span>Tax</span>
                <span>QAR {cart.tax.toLocaleString()}</span>
              </div>
              <div className="invoice-divider" />
              <div className="invoice-row invoice-row--total">
                <span>Total Amount Due</span>
                <span>QAR {cart.total.toLocaleString()}</span>
              </div>
              <div className="invoice-status invoice-status--pending">Pending — Pay at pickup</div>
              <button
                type="button"
                className="invoice-download"
                onClick={() => {
                  const html = `
<!DOCTYPE html>
<html><head><title>Invoice ${bookingId}</title>
<style>body{font-family:sans-serif;padding:2rem}table{width:100%;border-collapse:collapse;margin-top:1rem}td,th{padding:.5rem;text-align:left;border-bottom:1px solid #ddd}.total{font-weight:bold;font-size:1.1rem}</style>
</head><body>
<h1>Invoice</h1>
<p><strong>Invoice ID:</strong> ${bookingId}</p>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<table>
<tr><td>${cart.vehicleName} Rental</td><td>QAR ${cart.subtotal.toLocaleString()}</td></tr>
<tr><td>Tax</td><td>QAR ${cart.tax.toLocaleString()}</td></tr>
<tr class="total"><td>Total Amount Due</td><td>QAR ${cart.total.toLocaleString()}</td></tr>
</table>
<p style="margin-top:1rem;color:#666">Status: Pending — Pay at pickup</p>
</body></html>`
                  const blob = new Blob([html], { type: 'text/html' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `invoice-${bookingId}.html`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                }}
              >
                <Download size={16} />
                Download Invoice
              </button>
            </div>
          </aside>
        </div>
      </section>

      <Footer />
    </div>
  )
}
