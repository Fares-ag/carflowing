import type { Invoice, SwapRequest, Vehicle } from '@carflow/shared'
import {
  ApiError,
  isTemporarilyUnavailable,
  computeMonthlyPrice,
  DELIVERY_TIME_SLOTS,
  formatCurrency,
  formatDate,
  INVOICE_STATUS_LABELS,
  RENTAL_STATUS_LABELS,
  uploadVehicleImage,
} from '@carflow/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CreditCard, MailWarning, Pause, Play, Repeat, Star, Wrench, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from '../../hooks/useToast'
import { t } from '../../i18n'
import { resendVerificationEmail } from '../../services/authService'
import {
  cancelRental,
  cancelSwapRequest,
  createSwapRequest,
  createRentalMaintenanceRequest,
  extendRental,
  getRentalReview,
  getRentalSubscription,
  listCatalogVehicles,
  listRentalMaintenanceRequests,
  pauseRental,
  resumeRental,
  submitRentalReview,
} from '../../services/customerService'
import { createSkipCashInvoiceIntent, getSkipCashPaymentStatus, retrySkipCashPayment } from '../../services/paymentService'
import {
  clearInvoicePaymentAttempt,
  readInvoicePaymentAttempt,
  rememberInvoicePaymentAttempt,
} from '../../utils/paymentRetry'
import './SubscriptionPanel.css'

const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  requested: 'Pending review',
  scheduled: 'Scheduled',
  open: 'In progress',
  completed: 'Completed',
}

function invoicePeriod(invoice: Invoice): string {
  if (invoice.periodStart && invoice.periodEnd) {
    return `${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}`
  }
  return invoice.description
}

export function SubscriptionPanel({ rentalId }: { rentalId: string }) {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['rentalSubscription', rentalId],
    queryFn: () => getRentalSubscription(rentalId),
  })

  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null)
  const [retryingInvoiceId, setRetryingInvoiceId] = useState<string | null>(null)
  const [failedInvoicePayment, setFailedInvoicePayment] = useState<{
    invoiceId: string
    paymentId: string
  } | null>(null)
  const [showVerifyPrompt, setShowVerifyPrompt] = useState(false)
  const [resending, setResending] = useState(false)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelCollection, setCancelCollection] = useState({
    mode: 'collection' as 'collection' | 'dealer_return',
    location: '',
    date: '',
    time: DELIVERY_TIME_SLOTS[0],
  })
  const [cancelling, setCancelling] = useState(false)

  const [swapOpen, setSwapOpen] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [swapNote, setSwapNote] = useState('')
  const [swapError, setSwapError] = useState('')
  const [submittingSwap, setSubmittingSwap] = useState(false)
  const [cancellingSwapId, setCancellingSwapId] = useState<string | null>(null)

  const [extendOpen, setExtendOpen] = useState(false)
  const [extendMonths, setExtendMonths] = useState(1)
  const [extending, setExtending] = useState(false)

  const [pauseOpen, setPauseOpen] = useState(false)
  const [pauseDays, setPauseDays] = useState(30)
  const [pauseReason, setPauseReason] = useState('')
  const [pausing, setPausing] = useState(false)
  const [resuming, setResuming] = useState(false)

  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [existingReview, setExistingReview] = useState<{ rating: number; comment?: string | null } | null>(
    null
  )

  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
  const [maintenanceDescription, setMaintenanceDescription] = useState('')
  const [maintenancePhotos, setMaintenancePhotos] = useState<string[]>([])
  const [maintenanceUploading, setMaintenanceUploading] = useState(false)
  const [submittingMaintenance, setSubmittingMaintenance] = useState(false)

  const { data: vehiclesData, isLoading: loadingVehicles } = useQuery({
    queryKey: ['vehicles', 'swap-candidates'],
    queryFn: () => listCatalogVehicles({ pageSize: 100 }),
    enabled: swapOpen,
  })

  const { data: reviewData } = useQuery({
    queryKey: ['rentalReview', rentalId],
    queryFn: () => getRentalReview(rentalId),
    enabled: !!data && data.rental.status === 'completed',
  })

  const { data: maintenanceData, refetch: refetchMaintenance } = useQuery({
    queryKey: ['rentalMaintenance', rentalId],
    queryFn: () => listRentalMaintenanceRequests(rentalId),
    enabled:
      !isLoading &&
      !isError &&
      !!data &&
      ['reserved', 'active', 'past_due'].includes(data.rental.status),
  })

  useEffect(() => {
    if (reviewData) {
      setExistingReview(reviewData)
      setReviewRating(reviewData.rating)
      setReviewComment(reviewData.comment ?? '')
    }
  }, [reviewData])

  useEffect(() => {
    const attempt = readInvoicePaymentAttempt()
    if (!attempt) return
    let cancelled = false
    void getSkipCashPaymentStatus(attempt.paymentId)
      .then((payment) => {
        if (cancelled) return
        if (payment.status === 'failed' || payment.status === 'pending') {
          setFailedInvoicePayment(attempt)
        } else if (payment.status === 'completed') {
          clearInvoicePaymentAttempt()
          setFailedInvoicePayment(null)
        }
      })
      .catch(() => {
        if (!cancelled) setFailedInvoicePayment(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const swapCandidates = useMemo<Vehicle[]>(() => {
    if (!data) return []
    const dealerId = data.vehicle?.dealerId ?? data.rental.dealerId
    return (vehiclesData?.items ?? []).filter(
      (v) => v.status === 'available' && v.dealerId === dealerId && v.id !== data.rental.vehicleId
    )
  }, [vehiclesData, data])

  if (isLoading) {
    return (
      <section className="subscription-panel" aria-busy="true">
        <h2 className="subscription-panel__title">Subscription</h2>
        <p className="subscription-empty">Loading subscription details…</p>
      </section>
    )
  }

  if (isError || !data) {
    return (
      <section className="subscription-panel">
        <h2 className="subscription-panel__title">Subscription</h2>
        <p className="subscription-empty">We couldn&apos;t load your subscription details. Try Refresh.</p>
      </section>
    )
  }

  const { rental, vehicle, invoices, swapRequests, swapEligibleFrom, maxPauseDays = 90 } = data
  const pendingSwap = swapRequests.find((s) => s.status === 'pending')
  const swapUnlocked = !!swapEligibleFrom && new Date(swapEligibleFrom).getTime() <= Date.now()
  const swapLockedMessage = swapEligibleFrom
    ? `Car swaps unlock on ${formatDate(swapEligibleFrom)}`
    : 'Car swaps unlock 30 days after handover'
  const canCancel =
    (rental.status === 'reserved' ||
      rental.status === 'active' ||
      rental.status === 'paused' ||
      rental.status === 'past_due') &&
    !rental.cancellationEffectiveDate

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['rentalSubscription', rentalId] }),
      queryClient.invalidateQueries({ queryKey: ['rentals'] }),
      queryClient.invalidateQueries({ queryKey: ['bookingRequests'] }),
    ])
  }

  const handlePayInvoice = async (invoice: Invoice) => {
    setPayingInvoiceId(invoice.id)
    try {
      const intent = await createSkipCashInvoiceIntent(invoice.id)
      rememberInvoicePaymentAttempt(invoice.id, intent.paymentId)
      window.location.href = intent.payUrl
      // Keep the button in its busy state while the browser navigates away.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to start the payment'
      if (err instanceof ApiError && err.status === 403) {
        setShowVerifyPrompt(true)
      }
      toast.error(isTemporarilyUnavailable(err) ? 'Online payments are temporarily paused' : message)
      setPayingInvoiceId(null)
    }
  }

  const handleRetryInvoicePayment = async (invoiceId: string, paymentId: string) => {
    setRetryingInvoiceId(invoiceId)
    try {
      const intent = await retrySkipCashPayment(paymentId)
      rememberInvoicePaymentAttempt(invoiceId, intent.paymentId)
      setFailedInvoicePayment({ invoiceId, paymentId: intent.paymentId })
      window.location.href = intent.payUrl
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to restart the payment')
      setRetryingInvoiceId(null)
    }
  }

  const handleResendVerification = async () => {
    setResending(true)
    try {
      await resendVerificationEmail()
      toast.success('Verification email sent — check your inbox, then try paying again.')
      setShowVerifyPrompt(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to resend the verification email')
    } finally {
      setResending(false)
    }
  }

  const handleCancelConfirm = async () => {
    setCancelling(true)
    try {
      const collectionPayload =
        rental.status !== 'reserved' && cancelCollection.date
          ? cancelCollection.mode === 'collection'
            ? {
                mode: 'collection' as const,
                location: cancelCollection.location.trim(),
                date: cancelCollection.date,
                time: cancelCollection.time,
              }
            : {
                mode: 'dealer_return' as const,
                date: cancelCollection.date,
                time: cancelCollection.time,
              }
          : undefined
      const updated = await cancelRental(rental.id, {
        reason: cancelReason.trim() || undefined,
        collection: collectionPayload,
      })
      setCancelOpen(false)
      setCancelReason('')
      setCancelCollection({
        mode: 'collection',
        location: '',
        date: '',
        time: DELIVERY_TIME_SLOTS[0],
      })
      if (updated.status === 'cancelled') {
        toast.success('Subscription cancelled.')
      } else if (updated.cancellationEffectiveDate) {
        toast.success(
          `Cancellation scheduled — your subscription ends on ${formatDate(updated.cancellationEffectiveDate)}.`
        )
      } else {
        toast.success('Cancellation requested.')
      }
      await refreshAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to cancel the subscription')
    } finally {
      setCancelling(false)
    }
  }

  const handleSwapSubmit = async () => {
    if (!selectedVehicleId) {
      setSwapError('Choose a car to swap to first.')
      return
    }
    setSubmittingSwap(true)
    setSwapError('')
    try {
      await createSwapRequest(rental.id, {
        vehicleId: selectedVehicleId,
        note: swapNote.trim() || undefined,
      })
      toast.success('Swap request sent to your dealer.')
      setSwapOpen(false)
      setSelectedVehicleId(null)
      setSwapNote('')
      await refreshAll()
    } catch (err) {
      // Surface 409 messages from the server verbatim (eligibility, availability, pending swap).
      setSwapError(err instanceof Error ? err.message : 'Unable to request a swap')
    } finally {
      setSubmittingSwap(false)
    }
  }

  const handleCancelSwap = async (swap: SwapRequest) => {
    setCancellingSwapId(swap.id)
    try {
      await cancelSwapRequest(swap.id)
      toast.success('Swap request cancelled.')
      await refreshAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to cancel the swap request')
    } finally {
      setCancellingSwapId(null)
    }
  }

  const handleExtendConfirm = async () => {
    setExtending(true)
    try {
      const updated = await extendRental(rental.id, extendMonths)
      toast.success(
        `Subscription extended — new end date ${formatDate(updated.endDate)} (${updated.termMonths} months total).`
      )
      setExtendOpen(false)
      await refreshAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to extend subscription')
    } finally {
      setExtending(false)
    }
  }

  const handlePauseConfirm = async () => {
    setPausing(true)
    try {
      const updated = await pauseRental(rental.id, {
        days: pauseDays,
        reason: pauseReason.trim() || undefined,
      })
      toast.success(`Subscription paused until ${formatDate(updated.pausedUntil!)}.`)
      setPauseOpen(false)
      setPauseReason('')
      await refreshAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to pause subscription')
    } finally {
      setPausing(false)
    }
  }

  const handleResume = async () => {
    setResuming(true)
    try {
      const updated = await resumeRental(rental.id)
      toast.success(
        updated.nextBillingDate
          ? `Welcome back! Billing resumes — next charge on ${formatDate(updated.nextBillingDate)}.`
          : 'Welcome back! Your subscription is active again.'
      )
      await refreshAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to resume subscription')
    } finally {
      setResuming(false)
    }
  }

  const handleReviewSubmit = async () => {
    setSubmittingReview(true)
    try {
      const review = await submitRentalReview(rental.id, {
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      })
      setExistingReview(review)
      toast.success('Thank you for your review!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to submit review')
    } finally {
      setSubmittingReview(false)
    }
  }

  const canExtend =
    (rental.status === 'active' || rental.status === 'reserved' || rental.status === 'past_due') &&
    !rental.cancellationEffectiveDate

  const canPause = rental.status === 'active' && !rental.cancellationEffectiveDate
  const canResume = rental.status === 'paused'

  const canRequestMaintenance = canExtend
  const openMaintenanceItems =
    maintenanceData?.items.filter((item) => item.status !== 'completed') ?? []

  const handleMaintenancePhoto = async (file: File) => {
    if (maintenancePhotos.length >= 5) {
      toast.error('You can attach up to 5 photos')
      return
    }
    setMaintenanceUploading(true)
    try {
      const url = await uploadVehicleImage(file, `maintenance/${rentalId}`)
      setMaintenancePhotos((prev) => [...prev, url])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to upload photo')
    } finally {
      setMaintenanceUploading(false)
    }
  }

  const handleMaintenanceSubmit = async () => {
    const description = maintenanceDescription.trim()
    if (!description) {
      toast.error('Please describe the issue or service needed')
      return
    }
    setSubmittingMaintenance(true)
    try {
      await createRentalMaintenanceRequest(rental.id, {
        description,
        photos: maintenancePhotos.length ? maintenancePhotos : undefined,
      })
      toast.success('Service request submitted — your dealer will follow up.')
      setMaintenanceOpen(false)
      setMaintenanceDescription('')
      setMaintenancePhotos([])
      await refetchMaintenance()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to submit service request')
    } finally {
      setSubmittingMaintenance(false)
    }
  }

  return (
    <section className="subscription-panel">
      <div className="subscription-panel__header">
        <div>
          <h2 className="subscription-panel__title">Subscription</h2>
          {vehicle && <p className="subscription-panel__vehicle">{vehicle.name}</p>}
        </div>
        <span className={`subscription-badge subscription-badge--${rental.status}`}>
          {RENTAL_STATUS_LABELS[rental.status]}
        </span>
      </div>

      <dl className="subscription-facts">
        <div>
          <dt>Monthly amount</dt>
          <dd>
            {formatCurrency(rental.monthlyAmount)}
            <span className="subscription-facts__unit">/month</span>
          </dd>
        </div>
        <div>
          <dt>Minimum term</dt>
          <dd>
            {rental.termMonths} {rental.termMonths === 1 ? 'month' : 'months'}
          </dd>
        </div>
        {rental.nextBillingDate && (
          <div>
            <dt>Next billing date</dt>
            <dd>{formatDate(rental.nextBillingDate)}</dd>
          </div>
        )}
        {rental.cancellationEffectiveDate && (
          <div className="subscription-facts__ending">
            <dt>Ends on</dt>
            <dd>{formatDate(rental.cancellationEffectiveDate)}</dd>
          </div>
        )}
        {rental.pausedUntil && rental.status === 'paused' && (
          <div>
            <dt>Paused until</dt>
            <dd>{formatDate(rental.pausedUntil)}</dd>
          </div>
        )}
      </dl>

      {rental.status === 'paused' && (
        <p className="subscription-pause-note">
          <Pause size={14} /> Your subscription is on hold — no monthly invoices while paused. Resume
          when you&apos;re back to restart billing
          {rental.nextBillingDate ? ` from ${formatDate(rental.nextBillingDate)}` : ''}.
        </p>
      )}

      {rental.cancellationEffectiveDate && rental.status !== 'cancelled' && (
        <p className="subscription-ending-note">
          <CalendarClock size={14} /> Cancellation scheduled — your subscription ends on{' '}
          {formatDate(rental.cancellationEffectiveDate)}.
        </p>
      )}

      <div className="subscription-invoices">
        <h3>Invoices</h3>
        {invoices.length === 0 ? (
          <p className="subscription-empty">No invoices yet.</p>
        ) : (
          <ul className="subscription-invoice-list">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="subscription-invoice-row">
                <div className="subscription-invoice-info">
                  <strong>{formatDate(invoice.date)}</strong>
                  <span>{invoicePeriod(invoice)}</span>
                </div>
                <div className="subscription-invoice-side">
                  <span className="subscription-invoice-amount">{formatCurrency(invoice.amount)}</span>
                  <span className={`subscription-badge subscription-badge--inv-${invoice.status}`}>
                    {INVOICE_STATUS_LABELS[invoice.status]}
                  </span>
                  {(invoice.status === 'due' || invoice.status === 'overdue') && (
                    <>
                      {failedInvoicePayment?.invoiceId === invoice.id ? (
                        <button
                          type="button"
                          className="subscription-btn subscription-btn--pay"
                          disabled={retryingInvoiceId !== null || payingInvoiceId !== null}
                          onClick={() =>
                            void handleRetryInvoicePayment(invoice.id, failedInvoicePayment.paymentId)
                          }
                        >
                          <CreditCard size={14} />
                          {retryingInvoiceId === invoice.id ? 'Restarting…' : 'Retry payment'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="subscription-btn subscription-btn--pay"
                          disabled={payingInvoiceId !== null || retryingInvoiceId !== null}
                          onClick={() => handlePayInvoice(invoice)}
                        >
                          <CreditCard size={14} />
                          {payingInvoiceId === invoice.id ? 'Redirecting…' : 'Pay online'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {showVerifyPrompt && (
          <div className="subscription-verify" role="alert">
            <MailWarning size={16} />
            <span>Your email isn&apos;t verified yet, so online payment is blocked.</span>
            <button
              type="button"
              className="subscription-btn subscription-btn--ghost"
              onClick={handleResendVerification}
              disabled={resending}
            >
              {resending ? 'Sending…' : 'Resend verification email'}
            </button>
          </div>
        )}
      </div>

      {canRequestMaintenance && (
        <div className="subscription-maintenance">
          <div className="subscription-maintenance__header">
            <h3>Service & maintenance</h3>
            <button
              type="button"
              className="subscription-btn"
              onClick={() => setMaintenanceOpen(true)}
            >
              <Wrench size={16} />
              Request service / report an issue
            </button>
          </div>
          {openMaintenanceItems.length === 0 ? (
            <p className="subscription-empty">No open service requests for this car.</p>
          ) : (
            <ul className="subscription-maintenance-list">
              {openMaintenanceItems.map((item) => (
                <li key={item.id} className="subscription-maintenance-item">
                  <div className="subscription-maintenance-item__head">
                    <strong>{item.title}</strong>
                    <span className={`subscription-maintenance-badge subscription-maintenance-badge--${item.status}`}>
                      {MAINTENANCE_STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </div>
                  {item.description ? <p>{item.description}</p> : null}
                  {item.scheduledAt ? (
                    <p className="subscription-maintenance-meta">
                      Scheduled for {formatDate(item.scheduledAt)}
                    </p>
                  ) : null}
                  <p className="subscription-maintenance-meta">
                    Submitted {formatDate(item.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pendingSwap && (
        <div className="subscription-swap-pending">
          <Repeat size={16} />
          <span>Car swap requested — waiting for your dealer to review it.</span>
          <button
            type="button"
            className="subscription-btn subscription-btn--ghost"
            onClick={() => handleCancelSwap(pendingSwap)}
            disabled={cancellingSwapId === pendingSwap.id}
          >
            {cancellingSwapId === pendingSwap.id ? 'Cancelling…' : 'Cancel swap request'}
          </button>
        </div>
      )}

      {(canCancel || rental.status === 'active' || canExtend || canPause || canResume) && (
        <div className="subscription-actions">
          {canResume && (
            <button
              type="button"
              className="subscription-btn subscription-btn--primary"
              disabled={resuming}
              onClick={() => void handleResume()}
            >
              <Play size={16} />
              {resuming ? 'Resuming…' : 'Resume subscription'}
            </button>
          )}
          {canPause && (
            <button
              type="button"
              className="subscription-btn"
              onClick={() => {
                setPauseDays(Math.min(30, maxPauseDays))
                setPauseOpen(true)
              }}
            >
              <Pause size={16} />
              Pause subscription
            </button>
          )}
          {canExtend && (
            <button
              type="button"
              className="subscription-btn"
              onClick={() => setExtendOpen(true)}
            >
              <CalendarClock size={16} />
              {t('subscription.extend')}
            </button>
          )}
          {rental.status === 'active' && !pendingSwap && (
            <div
              className="subscription-swap-wrap"
              title={!swapUnlocked ? swapLockedMessage : undefined}
            >
              <button
                type="button"
                className="subscription-btn"
                disabled={!swapUnlocked}
                onClick={() => {
                  setSwapError('')
                  setSwapOpen(true)
                }}
              >
                <Repeat size={16} />
                Request car swap
              </button>
              {!swapUnlocked && <p className="subscription-hint">{swapLockedMessage}</p>}
            </div>
          )}
          {canCancel && (
            <button
              type="button"
              className="subscription-btn subscription-btn--danger"
              onClick={() => setCancelOpen(true)}
            >
              Cancel subscription
            </button>
          )}
        </div>
      )}

      {rental.status === 'completed' && (
        <div className="subscription-review">
          <h3>{t('subscription.reviewTitle')}</h3>
          {existingReview ? (
            <p className="subscription-review-done">
              <Star size={14} fill="#f59e0b" color="#f59e0b" /> You rated {existingReview.rating}/5
              {existingReview.comment ? ` — "${existingReview.comment}"` : ''}
            </p>
          ) : (
            <>
              <div className="subscription-review-stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`subscription-review-star ${reviewRating >= n ? 'active' : ''}`}
                    aria-label={`${n} stars`}
                    onClick={() => setReviewRating(n)}
                  >
                    <Star size={20} />
                  </button>
                ))}
              </div>
              <label className="subscription-modal__field">
                <span>Comment (optional)</span>
                <textarea
                  rows={2}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share your experience"
                />
              </label>
              <button
                type="button"
                className="subscription-btn subscription-btn--primary"
                disabled={submittingReview}
                onClick={handleReviewSubmit}
              >
                {submittingReview ? 'Submitting…' : t('subscription.reviewSubmit')}
              </button>
            </>
          )}
        </div>
      )}

      {maintenanceOpen && (
        <div className="subscription-modal-overlay" role="dialog" aria-modal="true">
          <div className="subscription-modal">
            <button
              type="button"
              className="subscription-modal__close"
              aria-label="Close"
              onClick={() => setMaintenanceOpen(false)}
            >
              <X size={16} />
            </button>
            <h3>Request service / report an issue</h3>
            <p>
              Describe what you need and optionally attach photos. Your dealer will review and schedule
              service.
            </p>
            <label className="subscription-modal__field">
              <span>Description</span>
              <textarea
                rows={4}
                value={maintenanceDescription}
                onChange={(e) => setMaintenanceDescription(e.target.value)}
                placeholder="e.g. warning light on dashboard, unusual noise when braking…"
                required
              />
            </label>
            <label className="subscription-modal__field">
              <span>Photos (optional, up to 5)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={maintenanceUploading || maintenancePhotos.length >= 5}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleMaintenancePhoto(file)
                  e.target.value = ''
                }}
              />
              {maintenanceUploading ? <p className="subscription-modal__hint">Uploading…</p> : null}
              {maintenancePhotos.length > 0 ? (
                <ul className="subscription-maintenance-photos">
                  {maintenancePhotos.map((url) => (
                    <li key={url}>
                      <img src={url} alt="" />
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
            <div className="subscription-modal__actions">
              <button
                type="button"
                className="subscription-btn"
                onClick={() => setMaintenanceOpen(false)}
                disabled={submittingMaintenance}
              >
                Cancel
              </button>
              <button
                type="button"
                className="subscription-btn subscription-btn--primary"
                onClick={handleMaintenanceSubmit}
                disabled={submittingMaintenance || maintenanceUploading}
              >
                {submittingMaintenance ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {extendOpen && (
        <div className="subscription-modal-overlay" role="dialog" aria-modal="true">
          <div className="subscription-modal">
            <button
              type="button"
              className="subscription-modal__close"
              aria-label="Close"
              onClick={() => setExtendOpen(false)}
            >
              <X size={16} />
            </button>
            <h3>{t('subscription.extendTitle')}</h3>
            <p>
              Extend your minimum term. Your monthly amount stays the same — we&apos;ll add{' '}
              {extendMonths} {extendMonths === 1 ? 'month' : 'months'} to your subscription end date.
            </p>
            <label className="subscription-modal__field">
              <span>{t('subscription.extendMonths')}</span>
              <select
                value={extendMonths}
                onChange={(e) => setExtendMonths(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'month' : 'months'}
                  </option>
                ))}
              </select>
            </label>
            <div className="subscription-modal__actions">
              <button
                type="button"
                className="subscription-btn"
                onClick={() => setExtendOpen(false)}
                disabled={extending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="subscription-btn subscription-btn--primary"
                onClick={handleExtendConfirm}
                disabled={extending}
              >
                {extending ? 'Extending…' : t('subscription.extendConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {pauseOpen && (
        <div className="subscription-modal-overlay" role="dialog" aria-modal="true">
          <div className="subscription-modal">
            <button
              type="button"
              className="subscription-modal__close"
              aria-label="Close"
              onClick={() => setPauseOpen(false)}
            >
              <X size={16} />
            </button>
            <h3>Pause subscription?</h3>
            <p>
              Put your car subscription on hold while you travel. No monthly invoices are generated
              during the pause (up to {maxPauseDays} days). When you resume, your next billing date
              shifts forward by the time you were paused
              {rental.nextBillingDate ? ` — currently ${formatDate(rental.nextBillingDate)}` : ''}.
            </p>
            <label className="subscription-modal__field">
              <span>Pause duration</span>
              <select value={pauseDays} onChange={(e) => setPauseDays(Number(e.target.value))}>
                {Array.from({ length: maxPauseDays }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'day' : 'days'}
                  </option>
                ))}
              </select>
            </label>
            <label className="subscription-modal__field">
              <span>Reason (optional)</span>
              <textarea
                rows={3}
                value={pauseReason}
                placeholder="e.g. travelling abroad for a month"
                onChange={(e) => setPauseReason(e.target.value)}
              />
            </label>
            <div className="subscription-modal__actions">
              <button
                type="button"
                className="subscription-btn"
                onClick={() => setPauseOpen(false)}
                disabled={pausing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="subscription-btn subscription-btn--primary"
                onClick={() => void handlePauseConfirm()}
                disabled={pausing}
              >
                {pausing ? 'Pausing…' : 'Pause subscription'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelOpen && (
        <div className="subscription-modal-overlay" role="dialog" aria-modal="true">
          <div className="subscription-modal">
            <button
              type="button"
              className="subscription-modal__close"
              aria-label="Close"
              onClick={() => setCancelOpen(false)}
            >
              <X size={16} />
            </button>
            <h3>Cancel subscription?</h3>
            {rental.status === 'reserved' ? (
              <p>
                Your subscription hasn&apos;t started yet, so it will be cancelled immediately and the
                car released. Any online payment you made will be refunded.
              </p>
            ) : (
              <p>
                Monthly subscriptions have a 30-day notice period. Your subscription stays active —
                and billed — until the cancellation takes effect at the end of a billing period.
                We&apos;ll confirm the exact end date right away.
              </p>
            )}
            <label className="subscription-modal__field">
              <span>Reason (optional)</span>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Tell us why you're cancelling"
              />
            </label>
            {rental.status !== 'reserved' && (
              <>
                <p className="subscription-modal__hint">
                  Tell us when and where we should collect the vehicle at the end of your subscription.
                </p>
                <div className="subscription-modal__field">
                  <span>Return / collection</span>
                  <label className="subscription-radio">
                    <input
                      type="radio"
                      name="collectionMode"
                      checked={cancelCollection.mode === 'collection'}
                      onChange={() => setCancelCollection((c) => ({ ...c, mode: 'collection' }))}
                    />
                    Collect from my address
                  </label>
                  <label className="subscription-radio">
                    <input
                      type="radio"
                      name="collectionMode"
                      checked={cancelCollection.mode === 'dealer_return'}
                      onChange={() => setCancelCollection((c) => ({ ...c, mode: 'dealer_return' }))}
                    />
                    I&apos;ll return to the dealer
                  </label>
                </div>
                {cancelCollection.mode === 'collection' && (
                  <label className="subscription-modal__field">
                    <span>Collection address</span>
                    <input
                      type="text"
                      value={cancelCollection.location}
                      onChange={(e) =>
                        setCancelCollection((c) => ({ ...c, location: e.target.value }))
                      }
                      placeholder="Building, street, area, city"
                    />
                  </label>
                )}
                <div className="subscription-modal__grid">
                  <label className="subscription-modal__field">
                    <span>Preferred date</span>
                    <input
                      type="date"
                      value={cancelCollection.date}
                      onChange={(e) =>
                        setCancelCollection((c) => ({ ...c, date: e.target.value }))
                      }
                    />
                  </label>
                  <label className="subscription-modal__field">
                    <span>Time slot</span>
                    <select
                      value={cancelCollection.time}
                      onChange={(e) =>
                        setCancelCollection((c) => ({ ...c, time: e.target.value }))
                      }
                    >
                      {DELIVERY_TIME_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}
            <div className="subscription-modal__actions">
              <button
                type="button"
                className="subscription-btn"
                onClick={() => setCancelOpen(false)}
                disabled={cancelling}
              >
                Keep subscription
              </button>
              <button
                type="button"
                className="subscription-btn subscription-btn--danger"
                onClick={handleCancelConfirm}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {swapOpen && (
        <div className="subscription-modal-overlay" role="dialog" aria-modal="true">
          <div className="subscription-modal subscription-modal--swap">
            <button
              type="button"
              className="subscription-modal__close"
              aria-label="Close"
              onClick={() => setSwapOpen(false)}
            >
              <X size={16} />
            </button>
            <h3>Request a car swap</h3>
            <p>
              Pick another car from your dealer&apos;s fleet. Your dealer reviews the request and your
              monthly amount is adjusted to the new car after the swap.
            </p>
            {swapError && (
              <p className="subscription-swap-error" role="alert">
                {swapError}
              </p>
            )}
            {loadingVehicles ? (
              <p className="subscription-empty">Loading available cars…</p>
            ) : swapCandidates.length === 0 ? (
              <p className="subscription-empty">
                No other cars are available from your dealer right now.
              </p>
            ) : (
              <ul className="subscription-swap-list">
                {swapCandidates.map((v) => (
                  <li key={v.id}>
                    <label className="subscription-swap-option">
                      <input
                        type="radio"
                        name="swap-vehicle"
                        checked={selectedVehicleId === v.id}
                        onChange={() => setSelectedVehicleId(v.id)}
                      />
                      <span className="subscription-swap-option__name">
                        {v.name}
                        <small>
                          {v.year} · {v.transmission === 'automatic' ? 'Automatic' : 'Manual'} ·{' '}
                          {v.seats} seats
                        </small>
                      </span>
                      <span className="subscription-swap-option__price">
                        {formatCurrency(computeMonthlyPrice(v.pricePerDay))}/month
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <label className="subscription-modal__field">
              <span>Note to dealer (optional)</span>
              <textarea
                rows={2}
                value={swapNote}
                onChange={(e) => setSwapNote(e.target.value)}
                placeholder="Anything the dealer should know"
              />
            </label>
            <div className="subscription-modal__actions">
              <button
                type="button"
                className="subscription-btn"
                onClick={() => setSwapOpen(false)}
                disabled={submittingSwap}
              >
                Close
              </button>
              <button
                type="button"
                className="subscription-btn subscription-btn--primary"
                onClick={handleSwapSubmit}
                disabled={submittingSwap || swapCandidates.length === 0}
              >
                {submittingSwap ? 'Sending…' : 'Request swap'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
