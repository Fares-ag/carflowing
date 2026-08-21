import {
  computeRentalTotal,
  defaultRentalStartDate,
  formatCurrency,
  whatsAppLink,
} from '@carflow/shared'
import { useQuery } from '@tanstack/react-query'
import { Check, Clock, MessageCircle, RefreshCw } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SubscriptionPanel } from '../components/booking/SubscriptionPanel'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import {
  listBookingRequestsWithVehicles,
  listRentalsWithDetails,
} from '../services/customerService'
import './MyBookingPage.css'

/** Poll cadence while a request is pending or a rental is reserved. */
const LIVE_STATUS_POLL_MS = 15_000

type TimelineStep = 'sent' | 'approved' | 'active' | 'completed' | 'declined' | 'cancelled'

interface BookingJourney {
  id: string
  vehicleId: string
  vehicleName: string
  vehicleImage?: string
  startDate: string
  durationMonths: number
  total: number
  dealerName: string
  dealerPhone: string | null
  step: TimelineStep
  pickupLocation?: string
}

function parseNote(note: string | undefined) {
  if (!note) return null
  try {
    return JSON.parse(note) as {
      durationMonths?: number
      startDate?: string
      total?: number
      delivery?: { location?: string }
    }
  } catch {
    return null
  }
}

function stepIndex(step: TimelineStep): number {
  switch (step) {
    case 'sent':
      return 1
    case 'approved':
      return 2
    case 'active':
      return 3
    case 'completed':
      return 4
    case 'declined':
    case 'cancelled':
      return 0
    default:
      return 1
  }
}

export function MyBookingPage() {
  const location = useLocation()
  const justBooked = (location.state as { justBooked?: boolean; vehicleName?: string } | null)?.justBooked
  const justBookedVehicle = (location.state as { vehicleName?: string } | null)?.vehicleName

  useEffect(() => {
    if (justBooked) {
      window.history.replaceState({}, document.title)
    }
  }, [justBooked])

  const { data: requestsData, isLoading: loadingRequests, refetch: refetchRequests } = useQuery({
    queryKey: ['bookingRequests'],
    queryFn: () => listBookingRequestsWithVehicles({ pageSize: 50 }),
  })
  const { data: rentalsData, isLoading: loadingRentals, refetch: refetchRentals } = useQuery({
    queryKey: ['rentals', 'details', 50],
    queryFn: () => listRentalsWithDetails({ pageSize: 50 }),
  })

  const journeys = useMemo(() => {
    const requests = requestsData?.items ?? []
    const rentals = rentalsData?.items ?? []
    const byBookingId = new Map(rentals.filter((r) => r.bookingRequestId).map((r) => [r.bookingRequestId!, r]))

    return requests.map((br): BookingJourney => {
      const note = parseNote(br.note)
      const rental = byBookingId.get(br.id)
      const vehicle = (br as { vehicle?: { name?: string; imageUrl?: string; pricePerDay?: number } }).vehicle
      const months = note?.durationMonths ?? 1
      const pricePerDay = vehicle?.pricePerDay ?? 0
      const total = note?.total ?? computeRentalTotal(pricePerDay, months)

      let step: TimelineStep = 'sent'
      if (br.status === 'declined') step = 'declined'
      else if (rental?.status === 'cancelled') step = 'cancelled'
      else if (rental?.status === 'completed') step = 'completed'
      else if (rental?.status === 'active' || rental?.status === 'past_due') step = 'active'
      else if (br.status === 'approved' || rental?.status === 'reserved') step = 'approved'
      else step = 'sent'

      const rentalDetail = rental as (typeof rental & {
        dealer?: { name?: string; contactPhone?: string }
      }) | undefined
      const dealer = rentalDetail?.dealer

      return {
        id: br.id,
        vehicleId: br.vehicleId,
        vehicleName: vehicle?.name ?? 'Your vehicle',
        vehicleImage: vehicle?.imageUrl,
        startDate: note?.startDate ?? br.createdAt.slice(0, 10),
        durationMonths: months,
        total,
        dealerName: dealer?.name ?? 'Dealer',
        dealerPhone: dealer?.contactPhone ?? null,
        step,
        pickupLocation: note?.delivery?.location ?? rental?.pickupLocation,
      }
    })
  }, [requestsData, rentalsData])

  const activeJourneys = journeys.filter(
    (j: BookingJourney) => j.step !== 'completed' && j.step !== 'declined' && j.step !== 'cancelled'
  )
  const pastJourneys = journeys.filter(
    (j: BookingJourney) =>
      j.step === 'completed' || j.step === 'declined' || j.step === 'cancelled'
  )

  // The customer's current subscription: a live rental first, then the most
  // recent finished one (for its invoice history).
  const currentRental = useMemo(() => {
    const rentals = rentalsData?.items ?? []
    return (
      rentals.find((r) => r.status === 'active' || r.status === 'past_due') ??
      rentals.find((r) => r.status === 'reserved') ??
      rentals.find((r) => r.status === 'completed')
    )
  }, [rentalsData])

  const refresh = () => {
    refetchRequests()
    refetchRentals()
  }

  // Live status (gentle auto-refresh): while a booking request is still
  // pending or a rental is reserved, re-poll both queries every 15s so the
  // page follows the dealer's decision without manual refreshes.
  const shouldPoll = useMemo(() => {
    const hasPendingRequest = (requestsData?.items ?? []).some((br) => br.status === 'pending')
    const hasReservedRental = (rentalsData?.items ?? []).some((r) => r.status === 'reserved')
    return hasPendingRequest || hasReservedRental
  }, [requestsData, rentalsData])

  useEffect(() => {
    if (!shouldPoll) return
    const id = window.setInterval(() => {
      refetchRequests()
      refetchRentals()
    }, LIVE_STATUS_POLL_MS)
    return () => window.clearInterval(id)
  }, [shouldPoll, refetchRequests, refetchRentals])

  const isLoading = loadingRequests || loadingRentals

  return (
    <div className="my-booking-page">
      <Header />
      <main className="my-booking-main">
        <div className="my-booking-header">
          <div>
            <h1>My booking</h1>
            <p>Track your request from send to pickup in one place.</p>
          </div>
          <button type="button" className="my-booking-refresh" onClick={refresh}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {justBooked && (
          <div className="my-booking-success" role="status">
            Request sent{justBookedVehicle ? ` for ${justBookedVehicle}` : ''}. We&apos;ll notify you when the dealer
            responds.
          </div>
        )}

        {isLoading ? (
          <p className="my-booking-empty">Loading your booking…</p>
        ) : activeJourneys.length === 0 && pastJourneys.length === 0 && !currentRental ? (
          <div className="my-booking-empty-card">
            <p>No bookings yet.</p>
            <Link to="/browse" className="my-booking-cta">
              Browse cars
            </Link>
          </div>
        ) : (
          <>
            {activeJourneys.length > 0 && (
              <section className="my-booking-current">
                {activeJourneys.length > 1 && <h2 className="my-booking-section-title">Current</h2>}
                {activeJourneys.map((j) => (
                  <JourneyCard key={j.id} journey={j} />
                ))}
              </section>
            )}
            {currentRental && <SubscriptionPanel rentalId={currentRental.id} />}
          </>
        )}

        {pastJourneys.length > 0 && (
          <section className="my-booking-past">
            <h2>Past bookings</h2>
            {pastJourneys.map((j) => (
              <JourneyCard key={j.id} journey={j} compact />
            ))}
          </section>
        )}
      </main>
      <Footer />
    </div>
  )
}

function JourneyCard({ journey, compact = false }: { journey: BookingJourney; compact?: boolean }) {
  const current = stepIndex(journey.step)
  const steps: { key: TimelineStep; label: string; desc: string }[] = [
    { key: 'sent', label: 'Request sent', desc: 'Waiting for the dealer to review your request.' },
    {
      key: 'approved',
      label: 'Approved',
      desc: 'Pickup details confirmed. Pay at the shop or complete online payment if offered.',
    },
    { key: 'active', label: 'Active rental', desc: 'Your rental is in progress. Contact the dealer if you need help.' },
    { key: 'completed', label: 'Completed', desc: 'This rental has finished. Book again anytime.' },
  ]

  const whatsAppMessage = `Hi, I have a CarFlow booking for ${journey.vehicleName} starting ${journey.startDate}. Booking ref: ${journey.id.slice(0, 8)}.`
  const waHref =
    journey.dealerPhone && journey.step !== 'declined' && journey.step !== 'cancelled'
      ? whatsAppLink(journey.dealerPhone, whatsAppMessage)
      : null

  const bookAgainHref = `/car/${journey.vehicleId}?months=${journey.durationMonths}&start=${defaultRentalStartDate()}`

  return (
    <article className={`journey-card ${compact ? 'journey-card--compact' : ''}`}>
      <div className="journey-card-top">
        {journey.vehicleImage ? (
          <img src={journey.vehicleImage} alt="" className="journey-card-image" />
        ) : (
          <div className="journey-card-image journey-card-image--placeholder" />
        )}
        <div>
          <h3>{journey.vehicleName}</h3>
          <p className="journey-card-meta">
            {journey.dealerName} · Start {journey.startDate} · {formatCurrency(journey.total)}
          </p>
        </div>
      </div>

      {journey.step === 'declined' ? (
        <p className="journey-declined">This request was not approved. Browse other cars or try different dates.</p>
      ) : journey.step === 'cancelled' ? (
        <p className="journey-declined">This rental was cancelled.</p>
      ) : (
        <ol className="journey-timeline">
          {steps.map((s, i) => {
            const stepNum = i + 1
            const done = current > stepNum
            const active = current === stepNum
            return (
              <li
                key={s.key}
                className={`journey-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}
              >
                <span className="journey-step-icon">{done ? <Check size={14} /> : stepNum}</span>
                <div>
                  <strong>{s.label}</strong>
                  {active && <p>{s.desc}</p>}
                  {active && s.key === 'approved' && journey.pickupLocation && (
                    <p className="journey-pickup">Pickup: {journey.pickupLocation}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <div className="journey-actions">
        {waHref && (
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="journey-btn journey-btn--wa">
            <MessageCircle size={16} />
            Message dealer on WhatsApp
          </a>
        )}
        {(journey.step === 'completed' || journey.step === 'cancelled') && (
          <Link to={bookAgainHref} className="journey-btn journey-btn--primary">
            <RefreshCw size={16} />
            Book again
          </Link>
        )}
        {journey.step === 'sent' && (
          <p className="journey-hint">
            <Clock size={14} /> Usually reviewed within 1 business day
          </p>
        )}
      </div>
    </article>
  )
}
