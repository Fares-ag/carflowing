import type { RentalStatus } from '@carflow/shared'
import { formatCurrency, formatDateOrDash, RENTAL_STATUS_LABELS, invoiceStatusLabel, useLiveListRefresh } from '@carflow/shared'
import {
  ArrowDownToLine,
  Banknote,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Eye,
  KeyRound,
  Mail,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Header } from '../components/Header'
import {
  MAX_RENTAL_CONDITION_PHOTOS,
  RentalConditionPhotoUploader,
  RentalEventPhotoGrid,
} from '../components/RentalConditionPhotoUploader'
import { Sidebar } from '../components/Sidebar'
import {
  acknowledgePickupFulfilment,
  extendRental,
  getRental,
  listRentals,
  recordHandover,
  recordOfflinePayment,
  recordReturn,
  type RentalDetail,
  type RentalReturnInput,
  type RentalWithRelations,
} from '../services/dealerService'
import { RentalDeliveryPanel } from '../components/RentalDeliveryPanel'
import './Rentals.css'

const PAGE_SIZE = 10

const STATUS_TABS: Array<{ value: RentalStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  ...(Object.entries(RENTAL_STATUS_LABELS) as [RentalStatus, string][]).map(([value, label]) => ({
    value,
    label,
  })),
]

const FUEL_LEVELS = [
  { value: 'full', label: 'Full' },
  { value: '3/4', label: '¾' },
  { value: '1/2', label: '½' },
  { value: '1/4', label: '¼' },
  { value: 'low', label: 'Low' },
]

const STATUS_LABELS = RENTAL_STATUS_LABELS

const EVENT_LABELS: Record<string, string> = {
  pickup: 'Pickup / handover',
  return: 'Return',
  swap_out: 'Swap out',
  swap_in: 'Swap in',
  inspection: 'Inspection',
  note: 'Note',
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message && err.message !== 'Request failed'
    ? err.message
    : fallback
}

function addMonthsISO(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split('-').map((part) => parseInt(part, 10))
  const targetMonth0 = m - 1 + months
  const targetYear = y + Math.floor(targetMonth0 / 12)
  const normalizedMonth0 = ((targetMonth0 % 12) + 12) % 12
  const daysInMonth = new Date(Date.UTC(targetYear, normalizedMonth0 + 1, 0)).getUTCDate()
  const day = Math.min(d, daysInMonth)
  return new Date(Date.UTC(targetYear, normalizedMonth0, day)).toISOString().slice(0, 10)
}

function canExtendRental(rental: Pick<RentalWithRelations, 'status' | 'cancellationEffectiveDate'>) {
  return (
    (rental.status === 'active' || rental.status === 'reserved' || rental.status === 'past_due') &&
    !rental.cancellationEffectiveDate
  )
}

interface ConditionFormState {
  mileage: string
  fuelLevel: string
  conditionNotes: string
  vehicleNextStatus: 'available' | 'maintenance'
}

interface DepositFormState {
  mode: 'full_release' | 'partial_withhold'
  withheldAmount: string
  note: string
}

const EMPTY_CONDITION_FORM: ConditionFormState = {
  mileage: '',
  fuelLevel: 'full',
  conditionNotes: '',
  vehicleNextStatus: 'available',
}

const EMPTY_DEPOSIT_FORM: DepositFormState = {
  mode: 'full_release',
  withheldAmount: '0',
  note: '',
}

function buildDepositResolution(
  depositAmount: number,
  form: DepositFormState
): RentalReturnInput['depositResolution'] | undefined {
  if (depositAmount <= 0) return undefined
  const withheld =
    form.mode === 'partial_withhold' ? Number(form.withheldAmount.replace(/,/g, '').trim() || '0') : 0
  const release = depositAmount - withheld
  return {
    releaseAmount: release,
    withheldAmount: withheld,
    note: withheld > 0 ? form.note.trim() : undefined,
  }
}

export function Rentals() {
  const navigate = useNavigate()
  const [rentals, setRentals] = useState<RentalWithRelations[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<RentalStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Record payment modal
  const [payRental, setPayRental] = useState<RentalWithRelations | null>(null)
  const [payMethod, setPayMethod] = useState<'card' | 'bank' | 'wallet'>('bank')
  const [paySubmitting, setPaySubmitting] = useState(false)

  // Handover modal
  const [handoverRental, setHandoverRental] = useState<RentalWithRelations | null>(null)
  const [handoverForm, setHandoverForm] = useState<ConditionFormState>(EMPTY_CONDITION_FORM)
  const [handoverPhotos, setHandoverPhotos] = useState<string[]>([])
  const [handoverPhotosUploading, setHandoverPhotosUploading] = useState(false)
  const [handoverSubmitting, setHandoverSubmitting] = useState(false)

  // Return modal
  const [returnRental, setReturnRental] = useState<RentalWithRelations | null>(null)
  const [returnForm, setReturnForm] = useState<ConditionFormState>(EMPTY_CONDITION_FORM)
  const [returnPhotos, setReturnPhotos] = useState<string[]>([])
  const [returnDepositForm, setReturnDepositForm] = useState<DepositFormState>(EMPTY_DEPOSIT_FORM)
  const [returnPhotosUploading, setReturnPhotosUploading] = useState(false)
  const [returnSubmitting, setReturnSubmitting] = useState(false)

  // Detail modal
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RentalDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [extendRentalRow, setExtendRentalRow] = useState<RentalWithRelations | null>(null)
  const [extendMonths, setExtendMonths] = useState(1)
  const [extendSubmitting, setExtendSubmitting] = useState(false)
  const [fulfilmentSubmitting, setFulfilmentSubmitting] = useState(false)

  const refresh = useCallback(
    (showLoading = false) => {
      if (showLoading) setLoading(true)
      setError(null)
      return listRentals({
        page,
        pageSize: PAGE_SIZE,
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      })
        .then((data) => {
          setRentals(data.items)
          setTotal(data.total)
        })
        .catch((err) => setError(errorMessage(err, 'Failed to load rentals')))
        .finally(() => {
          if (showLoading) setLoading(false)
        })
    },
    [page, statusFilter]
  )

  useEffect(() => {
    void refresh(true)
  }, [refresh])

  const hasLiveRentals = useMemo(
    () => rentals.some((r) => r.status === 'reserved' || r.status === 'active' || r.status === 'past_due'),
    [rentals]
  )
  useLiveListRefresh(() => {
    void refresh(false)
  }, { active: hasLiveRentals })

  useEffect(() => {
    if (!detailId) {
      setDetail(null)
      setDetailError(null)
      return
    }
    setDetailLoading(true)
    setDetail(null)
    setDetailError(null)
    getRental(detailId)
      .then(setDetail)
      .catch((err) => setDetailError(errorMessage(err, 'Failed to load rental details')))
      .finally(() => setDetailLoading(false))
  }, [detailId])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const extendPreview = useMemo(() => {
    if (!extendRentalRow) return null
    const newEndDate = addMonthsISO(extendRentalRow.endDate, extendMonths)
    const addedAmount = Number(extendRentalRow.monthlyAmount) * extendMonths
    return { newEndDate, addedAmount }
  }, [extendRentalRow, extendMonths])

  const changeFilter = (value: RentalStatus | 'all') => {
    setStatusFilter(value)
    setPage(1)
  }

  const openPayModal = (rental: RentalWithRelations) => {
    setPayRental(rental)
    setPayMethod('bank')
  }

  const submitPayment = () => {
    if (!payRental || paySubmitting) return
    setPaySubmitting(true)
    recordOfflinePayment({ rentalId: payRental.id, method: payMethod })
      .then(() => {
        toast.success('Payment recorded')
        setPayRental(null)
        return refresh(false)
      })
      .catch((err) => toast.error(errorMessage(err, 'Could not record payment')))
      .finally(() => setPaySubmitting(false))
  }

  const openExtendModal = (rental: RentalWithRelations) => {
    setExtendRentalRow(rental)
    setExtendMonths(1)
  }

  const submitExtend = () => {
    if (!extendRentalRow || extendSubmitting || !extendPreview) return
    const preview = extendPreview
    setExtendSubmitting(true)
    extendRental(extendRentalRow.id, extendMonths)
      .then(() => {
        toast.success(
          `Subscription extended — new end date ${formatDateOrDash(preview.newEndDate)}.`
        )
        const extendedId = extendRentalRow.id
        setExtendRentalRow(null)
        if (detailId === extendedId) {
          void getRental(extendedId).then(setDetail).catch(() => undefined)
        }
        return refresh(false)
      })
      .catch((err) => toast.error(errorMessage(err, 'Could not extend subscription')))
      .finally(() => setExtendSubmitting(false))
  }

  const handlePickupFulfilment = (rentalId: string, status: 'scheduled' | 'delivered') => {
    setFulfilmentSubmitting(true)
    acknowledgePickupFulfilment(rentalId, status)
      .then(() => {
        toast.success(status === 'delivered' ? 'Marked as delivered' : 'Delivery scheduled')
        if (detailId === rentalId) {
          void getRental(rentalId).then(setDetail).catch(() => undefined)
        }
        return refresh(false)
      })
      .catch((err) => toast.error(errorMessage(err, 'Could not update delivery status')))
      .finally(() => setFulfilmentSubmitting(false))
  }

  const openHandoverModal = (rental: RentalWithRelations) => {
    setHandoverRental(rental)
    setHandoverForm({ ...EMPTY_CONDITION_FORM, mileage: String(rental.vehicle?.mileage ?? '') })
    setHandoverPhotos([])
  }

  const submitHandover = () => {
    if (!handoverRental || handoverSubmitting || handoverPhotosUploading) return
    const mileage = handoverForm.mileage.trim() === '' ? undefined : Number(handoverForm.mileage)
    if (mileage !== undefined && (!Number.isFinite(mileage) || mileage < 0)) {
      toast.error('Enter a valid mileage (km).')
      return
    }
    setHandoverSubmitting(true)
    recordHandover(handoverRental.id, {
      mileage,
      fuelLevel: handoverForm.fuelLevel,
      conditionNotes: handoverForm.conditionNotes.trim() || undefined,
      photos: handoverPhotos.length > 0 ? handoverPhotos : undefined,
    })
      .then(() => {
        toast.success('Handover recorded — subscription is now active')
        setHandoverRental(null)
        return refresh(false)
      })
      .catch((err) => toast.error(errorMessage(err, 'Could not record handover')))
      .finally(() => setHandoverSubmitting(false))
  }

  const openReturnModal = (rental: RentalWithRelations) => {
    setReturnRental(rental)
    setReturnForm({ ...EMPTY_CONDITION_FORM, mileage: String(rental.vehicle?.mileage ?? '') })
    setReturnPhotos([])
    const deposit = rental.depositAmount ?? 0
    setReturnDepositForm({
      mode: rental.depositRefundable === false ? 'partial_withhold' : 'full_release',
      withheldAmount: rental.depositRefundable === false ? String(deposit) : '0',
      note: '',
    })
  }

  const submitReturn = () => {
    if (!returnRental || returnSubmitting || returnPhotosUploading) return
    const mileage = returnForm.mileage.trim() === '' ? undefined : Number(returnForm.mileage)
    if (mileage !== undefined && (!Number.isFinite(mileage) || mileage < 0)) {
      toast.error('Enter a valid mileage (km).')
      return
    }

    const depositAmount = returnRental.depositAmount ?? 0
    const depositResolution = buildDepositResolution(depositAmount, returnDepositForm)
    if (depositAmount > 0 && depositResolution) {
      if (
        !Number.isFinite(depositResolution.withheldAmount) ||
        depositResolution.withheldAmount < 0 ||
        depositResolution.withheldAmount > depositAmount
      ) {
        toast.error('Enter a valid withheld amount.')
        return
      }
      if (depositResolution.withheldAmount > 0 && !depositResolution.note) {
        toast.error('Provide a reason when withholding deposit.')
        return
      }
    }

    setReturnSubmitting(true)
    recordReturn(returnRental.id, {
      mileage,
      fuelLevel: returnForm.fuelLevel,
      conditionNotes: returnForm.conditionNotes.trim() || undefined,
      vehicleNextStatus: returnForm.vehicleNextStatus,
      photos: returnPhotos.length > 0 ? returnPhotos : undefined,
      depositResolution,
    })
      .then(() => {
        toast.success('Return recorded — subscription completed')
        setReturnRental(null)
        setDetailId((id) => (id === returnRental.id ? null : id))
        return refresh(false)
      })
      .catch((err) => toast.error(errorMessage(err, 'Could not record return')))
      .finally(() => setReturnSubmitting(false))
  }

  const renderConditionFields = (
    form: ConditionFormState,
    setForm: (updater: (prev: ConditionFormState) => ConditionFormState) => void,
    photos: string[],
    setPhotos: (photos: string[]) => void,
    rentalId: string,
    disabled: boolean,
    photosUploading: boolean,
    onPhotosUploadingChange: (uploading: boolean) => void,
    idPrefix: string,
    photoKind: 'handover' | 'return'
  ) => (
    <>
      <label className="rnFormLabel" htmlFor={`${idPrefix}-mileage`}>
        Mileage (km)
        <input
          id={`${idPrefix}-mileage`}
          type="number"
          min={0}
          value={form.mileage}
          onChange={(e) => setForm((prev) => ({ ...prev, mileage: e.target.value }))}
          placeholder="e.g. 12500"
          disabled={disabled}
        />
      </label>
      <label className="rnFormLabel" htmlFor={`${idPrefix}-fuel`}>
        Fuel level
        <select
          id={`${idPrefix}-fuel`}
          value={form.fuelLevel}
          onChange={(e) => setForm((prev) => ({ ...prev, fuelLevel: e.target.value }))}
          disabled={disabled}
        >
          {FUEL_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </label>
      <label className="rnFormLabel" htmlFor={`${idPrefix}-notes`}>
        Condition notes
        <textarea
          id={`${idPrefix}-notes`}
          rows={4}
          value={form.conditionNotes}
          onChange={(e) => setForm((prev) => ({ ...prev, conditionNotes: e.target.value }))}
          placeholder="Scratches, dents, interior condition…"
          disabled={disabled}
        />
      </label>
      <RentalConditionPhotoUploader
        id={`${idPrefix}-photos`}
        photos={photos}
        onChange={setPhotos}
        uploadPrefix={`rental-${rentalId.slice(0, 8)}-${photoKind}`}
        disabled={disabled || photosUploading}
        onUploadingChange={onPhotosUploadingChange}
        label="Condition photos"
        hint={`Optional — up to ${MAX_RENTAL_CONDITION_PHOTOS} photos of exterior, interior, or damage.`}
      />
    </>
  )

  return (
    <div className="dashboard-page">
      <Sidebar />
      <Header />
      <div className="rentalsPage" role="main">
        <div className="rnPageHeader">
          <h1 className="rnPageTitle">Rentals</h1>
          <p className="rnPageSubtitle">
            Monthly subscriptions: record payments, hand vehicles over, and check them back in.
          </p>
        </div>

        {error && (
          <div className="rnError" role="alert">
            {error}
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <div className="rnTabs" role="tablist" aria-label="Filter rentals by status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.value}
              className={`rnTab ${statusFilter === tab.value ? 'rnTab--active' : ''}`}
              onClick={() => changeFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="rnTableCard">
          <table className="rnTable">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Monthly</th>
                <th>Next billing</th>
                <th>Start date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="rnLoading" role="status">
                      Loading rentals...
                    </div>
                  </td>
                </tr>
              ) : (
                rentals.map((rental) => (
                  <tr
                    key={rental.id}
                    className="rnRow"
                    onClick={() => setDetailId(rental.id)}
                  >
                    <td>
                      <div className="rnVehicle">{rental.vehicle?.name ?? 'Unknown vehicle'}</div>
                      <div className="rnSub">{rental.vehicle?.licensePlate ?? ''}</div>
                    </td>
                    <td>
                      <div className="rnCustomer">
                        <span className="rnCustomerName">{rental.customer?.name ?? '—'}</span>
                        <span className="rnCustomerEmail">{rental.customer?.email ?? '—'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`rnBadge rnBadge--${rental.status}`}>
                        {STATUS_LABELS[rental.status] ?? rental.status}
                      </span>
                      {rental.cancellationEffectiveDate && (
                        <div className="rnEndsHint">
                          Ends {formatDateOrDash(rental.cancellationEffectiveDate)}
                        </div>
                      )}
                    </td>
                    <td>{formatCurrency(rental.monthlyAmount)}</td>
                    <td>{formatDateOrDash(rental.nextBillingDate)}</td>
                    <td>{formatDateOrDash(rental.startDate)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="rnActions">
                        <button
                          type="button"
                          className="rnActionBtn rnActionBtn--view"
                          onClick={() => setDetailId(rental.id)}
                          title="Details"
                          aria-label="Details"
                        >
                          <Eye size={16} />
                        </button>
                        {rental.customer?.id ? (
                          <button
                            type="button"
                            className="rnActionBtn rnActionBtn--mail"
                            onClick={() => {
                              const params = new URLSearchParams({
                                customerId: rental.customer!.id,
                                rentalId: rental.id,
                              })
                              navigate(`/messages?${params.toString()}`)
                            }}
                            title="Message customer"
                            aria-label="Message customer"
                          >
                            <Mail size={16} />
                          </button>
                        ) : null}
                        {(rental.status === 'reserved' || rental.status === 'past_due') && (
                          <button
                            type="button"
                            className="rnActionBtn rnActionBtn--pay"
                            onClick={() => openPayModal(rental)}
                            title="Record payment"
                            aria-label="Record payment"
                          >
                            <Banknote size={16} />
                          </button>
                        )}
                        {rental.status === 'reserved' && (
                          <button
                            type="button"
                            className="rnActionBtn rnActionBtn--handover"
                            onClick={() => openHandoverModal(rental)}
                            title="Handover vehicle"
                            aria-label="Handover vehicle"
                          >
                            <KeyRound size={16} />
                          </button>
                        )}
                        {(rental.status === 'active' || rental.status === 'past_due') && (
                          <button
                            type="button"
                            className="rnActionBtn rnActionBtn--return"
                            onClick={() => openReturnModal(rental)}
                            title="Return vehicle"
                            aria-label="Return vehicle"
                          >
                            <ArrowDownToLine size={16} />
                          </button>
                        )}
                        {canExtendRental(rental) && (
                          <button
                            type="button"
                            className="rnActionBtn rnActionBtn--extend"
                            onClick={() => openExtendModal(rental)}
                            title="Extend subscription"
                            aria-label="Extend subscription"
                          >
                            <CalendarPlus size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {!loading && rentals.length === 0 && (
            <div className="rnEmpty">
              {statusFilter === 'all'
                ? 'No rentals yet. Approved bookings appear here as subscriptions.'
                : `No ${STATUS_TABS.find((t) => t.value === statusFilter)?.label.toLowerCase()} rentals.`}
            </div>
          )}
          {!loading && total > PAGE_SIZE && (
            <div className="rnPagination">
              <span className="rnPageInfo">
                Page {page} of {totalPages} ({total} rentals)
              </span>
              <div className="rnPageBtns">
                <button
                  type="button"
                  className="rnPageBtn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button
                  type="button"
                  className="rnPageBtn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {payRental && (
        <div
          className="rnModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rn-pay-title"
          onClick={() => !paySubmitting && setPayRental(null)}
        >
          <div className="rnModal rnModal--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="rnModalHeader">
              <h2 id="rn-pay-title">Record offline payment</h2>
              <button
                type="button"
                className="rnModalClose"
                disabled={paySubmitting}
                onClick={() => setPayRental(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="rnModalBody">
              <p className="rnModalHint">
                {payRental.vehicle?.name ?? 'Vehicle'} — {payRental.customer?.name ?? 'customer'}.
                The amount is taken from the oldest unpaid invoice automatically.
              </p>
              <label className="rnFormLabel" htmlFor="rn-pay-method">
                Method
                <select
                  id="rn-pay-method"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as 'card' | 'bank' | 'wallet')}
                  disabled={paySubmitting}
                >
                  <option value="bank">Bank transfer / cash deposit</option>
                  <option value="wallet">Mobile wallet / other</option>
                  <option value="card">Card (terminal)</option>
                </select>
              </label>
              <div className="rnModalFooter">
                <button
                  type="button"
                  className="rnModalBtn rnModalBtn--secondary"
                  disabled={paySubmitting}
                  onClick={() => setPayRental(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rnModalBtn rnModalBtn--primary"
                  disabled={paySubmitting}
                  aria-busy={paySubmitting}
                  onClick={() => void submitPayment()}
                >
                  {paySubmitting ? 'Saving…' : 'Mark as paid'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {extendRentalRow && extendPreview && (
        <div
          className="rnModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rn-extend-title"
          onClick={() => !extendSubmitting && setExtendRentalRow(null)}
        >
          <div className="rnModal rnModal--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="rnModalHeader">
              <h2 id="rn-extend-title">Extend subscription</h2>
              <button
                type="button"
                className="rnModalClose"
                disabled={extendSubmitting}
                onClick={() => setExtendRentalRow(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="rnModalBody">
              <p className="rnModalHint">
                {extendRentalRow.vehicle?.name ?? 'Vehicle'} — {extendRentalRow.customer?.name ?? 'customer'}.
                The monthly rate stays the same; the minimum term and total contract value increase.
              </p>
              <label className="rnFormLabel" htmlFor="rn-extend-months">
                Months to add
                <select
                  id="rn-extend-months"
                  value={extendMonths}
                  onChange={(e) => setExtendMonths(Number(e.target.value))}
                  disabled={extendSubmitting}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'month' : 'months'}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rnExtendSummary">
                <p>
                  <strong>Current end date:</strong> {formatDateOrDash(extendRentalRow.endDate)}
                </p>
                <p>
                  <strong>New end date:</strong> {formatDateOrDash(extendPreview.newEndDate)}
                </p>
                <p>
                  <strong>Added amount:</strong> {formatCurrency(extendPreview.addedAmount)}
                </p>
                <p>
                  <strong>New total:</strong>{' '}
                  {formatCurrency(Number(extendRentalRow.totalAmount) + extendPreview.addedAmount)}
                </p>
              </div>
              <div className="rnModalFooter">
                <button
                  type="button"
                  className="rnModalBtn rnModalBtn--secondary"
                  disabled={extendSubmitting}
                  onClick={() => setExtendRentalRow(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rnModalBtn rnModalBtn--primary"
                  disabled={extendSubmitting}
                  aria-busy={extendSubmitting}
                  onClick={() => void submitExtend()}
                >
                  {extendSubmitting ? 'Extending…' : 'Confirm extension'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {handoverRental && (
        <div
          className="rnModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rn-handover-title"
          onClick={() => !handoverSubmitting && setHandoverRental(null)}
        >
          <div className="rnModal rnModal--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="rnModalHeader">
              <h2 id="rn-handover-title">Handover vehicle</h2>
              <button
                type="button"
                className="rnModalClose"
                disabled={handoverSubmitting}
                onClick={() => setHandoverRental(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="rnModalBody">
              <p className="rnModalHint">
                Record the condition of {handoverRental.vehicle?.name ?? 'the vehicle'} at pickup.
                This activates the subscription — the first payment must be recorded before.
              </p>
              {renderConditionFields(
                handoverForm,
                setHandoverForm,
                handoverPhotos,
                setHandoverPhotos,
                handoverRental.id,
                handoverSubmitting || handoverPhotosUploading,
                handoverPhotosUploading,
                setHandoverPhotosUploading,
                'rn-handover',
                'handover'
              )}
              <div className="rnModalFooter">
                <button
                  type="button"
                  className="rnModalBtn rnModalBtn--secondary"
                  disabled={handoverSubmitting}
                  onClick={() => setHandoverRental(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rnModalBtn rnModalBtn--primary"
                  disabled={handoverSubmitting || handoverPhotosUploading}
                  aria-busy={handoverSubmitting || handoverPhotosUploading}
                  onClick={() => void submitHandover()}
                >
                  {handoverSubmitting ? 'Recording…' : handoverPhotosUploading ? 'Uploading photos…' : 'Confirm handover'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {returnRental && (
        <div
          className="rnModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rn-return-title"
          onClick={() => !returnSubmitting && setReturnRental(null)}
        >
          <div className="rnModal rnModal--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="rnModalHeader">
              <h2 id="rn-return-title">Return vehicle</h2>
              <button
                type="button"
                className="rnModalClose"
                disabled={returnSubmitting}
                onClick={() => setReturnRental(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="rnModalBody">
              <p className="rnModalHint">
                Record the condition of {returnRental.vehicle?.name ?? 'the vehicle'} at return.
                This completes the subscription.
              </p>
              {renderConditionFields(
                returnForm,
                setReturnForm,
                returnPhotos,
                setReturnPhotos,
                returnRental.id,
                returnSubmitting || returnPhotosUploading,
                returnPhotosUploading,
                setReturnPhotosUploading,
                'rn-return',
                'return'
              )}
              {(returnRental.depositAmount ?? 0) > 0 ? (
                <fieldset className="rnDepositSection">
                  <legend>Security deposit ({formatCurrency(returnRental.depositAmount ?? 0)})</legend>
                  <p className="rnModalHint">
                    {returnRental.depositRefundable === false
                      ? 'This deposit is not refundable — record any withholdings only.'
                      : 'Choose how to settle the customer deposit before completing the return.'}
                  </p>
                  <label className="rnRadioLabel">
                    <input
                      type="radio"
                      name="rn-deposit-mode"
                      value="full_release"
                      checked={returnDepositForm.mode === 'full_release'}
                      onChange={() => setReturnDepositForm((prev) => ({ ...prev, mode: 'full_release' }))}
                      disabled={returnSubmitting || returnRental.depositRefundable === false}
                    />
                    Release full deposit ({formatCurrency(returnRental.depositAmount ?? 0)})
                  </label>
                  <label className="rnRadioLabel">
                    <input
                      type="radio"
                      name="rn-deposit-mode"
                      value="partial_withhold"
                      checked={returnDepositForm.mode === 'partial_withhold'}
                      onChange={() =>
                        setReturnDepositForm((prev) => ({ ...prev, mode: 'partial_withhold' }))
                      }
                      disabled={returnSubmitting}
                    />
                    Withhold part of the deposit
                  </label>
                  {returnDepositForm.mode === 'partial_withhold' ? (
                    <>
                      <label className="rnFormLabel" htmlFor="rn-deposit-withheld">
                        Amount to withhold
                        <input
                          id="rn-deposit-withheld"
                          type="number"
                          min={0}
                          max={returnRental.depositAmount ?? 0}
                          step="0.01"
                          value={returnDepositForm.withheldAmount}
                          onChange={(e) =>
                            setReturnDepositForm((prev) => ({ ...prev, withheldAmount: e.target.value }))
                          }
                          disabled={returnSubmitting}
                        />
                      </label>
                      <p className="rnDepositReleaseHint">
                        Customer receives{' '}
                        {formatCurrency(
                          Math.max(
                            0,
                            (returnRental.depositAmount ?? 0) -
                              Number(returnDepositForm.withheldAmount.replace(/,/g, '') || 0)
                          )
                        )}
                      </p>
                      <label className="rnFormLabel" htmlFor="rn-deposit-note">
                        Reason for withholding
                        <textarea
                          id="rn-deposit-note"
                          rows={3}
                          value={returnDepositForm.note}
                          onChange={(e) =>
                            setReturnDepositForm((prev) => ({ ...prev, note: e.target.value }))
                          }
                          placeholder="Describe damage, cleaning fees, missing items…"
                          disabled={returnSubmitting}
                        />
                      </label>
                    </>
                  ) : null}
                </fieldset>
              ) : null}
              <fieldset className="rnRadioGroup">
                <legend>Vehicle goes to</legend>
                <label className="rnRadioLabel">
                  <input
                    type="radio"
                    name="rn-vehicle-next-status"
                    value="available"
                    checked={returnForm.vehicleNextStatus === 'available'}
                    onChange={() =>
                      setReturnForm((prev) => ({ ...prev, vehicleNextStatus: 'available' }))
                    }
                    disabled={returnSubmitting}
                  />
                  Available (back in the fleet)
                </label>
                <label className="rnRadioLabel">
                  <input
                    type="radio"
                    name="rn-vehicle-next-status"
                    value="maintenance"
                    checked={returnForm.vehicleNextStatus === 'maintenance'}
                    onChange={() =>
                      setReturnForm((prev) => ({ ...prev, vehicleNextStatus: 'maintenance' }))
                    }
                    disabled={returnSubmitting}
                  />
                  Maintenance (needs work first)
                </label>
              </fieldset>
              <div className="rnModalFooter">
                <button
                  type="button"
                  className="rnModalBtn rnModalBtn--secondary"
                  disabled={returnSubmitting}
                  onClick={() => setReturnRental(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rnModalBtn rnModalBtn--primary"
                  disabled={returnSubmitting || returnPhotosUploading}
                  aria-busy={returnSubmitting || returnPhotosUploading}
                  onClick={() => void submitReturn()}
                >
                  {returnSubmitting ? 'Recording…' : returnPhotosUploading ? 'Uploading photos…' : 'Complete return'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailId && (
        <div
          className="rnModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rn-detail-title"
          onClick={() => setDetailId(null)}
        >
          <div className="rnModal" onClick={(e) => e.stopPropagation()}>
            <div className="rnModalHeader">
              <h2 id="rn-detail-title">Rental details</h2>
              <button
                type="button"
                className="rnModalClose"
                onClick={() => setDetailId(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="rnModalBody">
              {detailLoading && <p className="rnModalHint">Loading rental…</p>}
              {detailError && (
                <p className="rnModalHint rnModalHint--warn" role="alert">
                  {detailError}
                </p>
              )}
              {detail && (
                <>
                  <div className="rnDetailGrid">
                    <p className="rnDetailItem">
                      <strong>Vehicle</strong> {detail.vehicle?.name ?? 'Unknown'}
                    </p>
                    <p className="rnDetailItem">
                      <strong>Customer</strong>{' '}
                      {detail.customer?.name ?? '—'} ({detail.customer?.email ?? '—'})
                      {detail.customer?.id ? (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="rnInlineLinkBtn"
                            onClick={() => {
                              const params = new URLSearchParams({
                                customerId: detail.customer!.id,
                                rentalId: detail.id,
                              })
                              navigate(`/messages?${params.toString()}`)
                              setDetailId(null)
                            }}
                          >
                            Message customer
                          </button>
                        </>
                      ) : null}
                    </p>
                    <p className="rnDetailItem">
                      <strong>Status</strong>{' '}
                      <span className={`rnBadge rnBadge--${detail.status}`}>
                        {STATUS_LABELS[detail.status] ?? detail.status}
                      </span>
                    </p>
                    <p className="rnDetailItem">
                      <strong>Monthly</strong> {formatCurrency(detail.monthlyAmount)} · {detail.termMonths}{' '}
                      month min. term
                    </p>
                    <p className="rnDetailItem">
                      <strong>Start</strong> {formatDateOrDash(detail.startDate)}
                    </p>
                    <p className="rnDetailItem">
                      <strong>Next billing</strong> {formatDateOrDash(detail.nextBillingDate)}
                    </p>
                    {detail.activatedAt && (
                      <p className="rnDetailItem">
                        <strong>Activated</strong> {formatDateOrDash(detail.activatedAt)}
                      </p>
                    )}
                    {detail.completedAt && (
                      <p className="rnDetailItem">
                        <strong>Completed</strong> {formatDateOrDash(detail.completedAt)}
                      </p>
                    )}
                    {(detail.depositAmount ?? 0) > 0 ? (
                      <p className="rnDetailItem">
                        <strong>Deposit</strong> {formatCurrency(detail.depositAmount ?? 0)}
                        {detail.depositRefundable === false ? ' (non-refundable)' : ''}
                      </p>
                    ) : null}
                    {detail.depositResolvedAt ? (
                      <>
                        <p className="rnDetailItem">
                          <strong>Deposit released</strong>{' '}
                          {formatCurrency(detail.depositResolvedAmount ?? 0)}
                        </p>
                        {(detail.depositWithheldAmount ?? 0) > 0 ? (
                          <p className="rnDetailItem rnDetailItem--warn">
                            <strong>Deposit withheld</strong>{' '}
                            {formatCurrency(detail.depositWithheldAmount ?? 0)}
                            {detail.depositResolutionNote ? ` — ${detail.depositResolutionNote}` : ''}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    {detail.cancellationEffectiveDate && (
                      <p className="rnDetailItem rnDetailItem--warn">
                        <strong>Ends</strong> {formatDateOrDash(detail.cancellationEffectiveDate)}
                      </p>
                    )}
                  </div>

                  <RentalDeliveryPanel
                    rental={detail}
                    acknowledging={fulfilmentSubmitting}
                    onAcknowledge={(status) => handlePickupFulfilment(detail.id, status)}
                  />

                  <h3 className="rnSectionTitle">Invoices</h3>
                  {detail.invoices.length === 0 ? (
                    <p className="rnModalHint">No invoices yet.</p>
                  ) : (
                    <table className="rnInvoiceTable">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.invoices.map((invoice) => (
                          <tr key={invoice.id}>
                            <td>{formatDateOrDash(invoice.date)}</td>
                            <td>
                              {invoice.description}
                              {invoice.periodStart && invoice.periodEnd && (
                                <div className="rnSub">
                                  {formatDateOrDash(invoice.periodStart)} – {formatDateOrDash(invoice.periodEnd)}
                                </div>
                              )}
                            </td>
                            <td>{formatCurrency(invoice.amount)}</td>
                            <td>
                              <span className={`rnBadge rnBadge--inv-${invoice.status}`}>
                                {invoiceStatusLabel(invoice.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <h3 className="rnSectionTitle">Timeline</h3>
                  {detail.events.length === 0 ? (
                    <p className="rnModalHint">No events recorded yet.</p>
                  ) : (
                    <ol className="rnTimeline">
                      {[...detail.events]
                        .sort(
                          (a, b) =>
                            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                        )
                        .map((event) => (
                          <li key={event.id} className={`rnEvent rnEvent--${event.type}`}>
                            <div className="rnEventHead">
                              <span className="rnEventType">
                                {EVENT_LABELS[event.type] ?? event.type}
                              </span>
                              <span className="rnEventDate">{formatDateOrDash(event.createdAt)}</span>
                            </div>
                            <div className="rnEventMeta">
                              {event.mileage !== undefined && (
                                <span>{event.mileage.toLocaleString()} km</span>
                              )}
                              {event.fuelLevel && <span>Fuel: {event.fuelLevel}</span>}
                            </div>
                            {event.conditionNotes && (
                              <p className="rnEventNotes">{event.conditionNotes}</p>
                            )}
                            <RentalEventPhotoGrid photos={event.photos ?? []} />
                          </li>
                        ))}
                    </ol>
                  )}

                  <div className="rnModalFooter">
                    {(detail.status === 'reserved' || detail.status === 'past_due') && (
                      <button
                        type="button"
                        className="rnModalBtn rnModalBtn--secondary"
                        onClick={() => {
                          openPayModal(detail)
                          setDetailId(null)
                        }}
                      >
                        Record payment…
                      </button>
                    )}
                    {detail.status === 'reserved' && (
                      <button
                        type="button"
                        className="rnModalBtn rnModalBtn--primary"
                        onClick={() => {
                          openHandoverModal(detail)
                          setDetailId(null)
                        }}
                      >
                        Handover…
                      </button>
                    )}
                    {(detail.status === 'active' || detail.status === 'past_due') && (
                      <button
                        type="button"
                        className="rnModalBtn rnModalBtn--primary"
                        onClick={() => {
                          openReturnModal(detail)
                          setDetailId(null)
                        }}
                      >
                        Return vehicle…
                      </button>
                    )}
                    <button
                      type="button"
                      className="rnModalBtn rnModalBtn--secondary"
                      onClick={() => setDetailId(null)}
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
