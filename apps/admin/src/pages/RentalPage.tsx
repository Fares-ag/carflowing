import { formatCurrency, formatDate, RENTAL_STATUS_LABELS, rentalStatusLabel, useLiveListRefresh, type RentalStatus } from '@carflow/shared'
import { CalendarCheck, Car, CheckCircle2, CreditCard, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AdminLayout } from '../layout/AdminLayout'
import {
  cancelRental,
  getRentalFull,
  listRentalsWithDetails,
  updateRentalStatus,
  type RentalFullDetails,
  type RentalWithDetails,
} from '../services/adminService'
import '../components/InfoModal.css'
import './RentalPage.css'

const STATUS_CLASS: Record<RentalStatus, string> = {
  active: 'adminBadge adminBadge--green',
  reserved: 'adminBadge adminBadge--blue',
  paused: 'adminBadge rentalBadge--paused',
  past_due: 'adminBadge rentalBadge--pastdue',
  completed: 'adminBadge adminBadge--amber',
  cancelled: 'adminBadge adminBadge--red',
}

type RowActionType = 'activate' | 'complete' | 'cancel'

interface ActionModalState {
  type: RowActionType
  rental: RentalWithDetails
  /** Cancel reason / completion note typed by the admin. */
  text: string
  isSubmitting: boolean
}

interface DetailsModalState {
  rentalId: string
  data: RentalFullDetails | null
  isLoading: boolean
}

const ACTION_COPY: Record<
  RowActionType,
  { title: string; message: string; confirmLabel: string; inputLabel?: string }
> = {
  activate: {
    title: 'Mark rental active',
    message:
      'Confirm the vehicle has been handed over to the customer. The rental becomes active and billing continues on its monthly cycle.',
    confirmLabel: 'Mark active',
    inputLabel: 'Note (optional)',
  },
  complete: {
    title: 'Mark rental completed',
    message:
      'Confirm the vehicle has been returned. The rental is closed and the vehicle becomes available again.',
    confirmLabel: 'Mark completed',
    inputLabel: 'Note (optional)',
  },
  cancel: {
    title: 'Cancel rental',
    message:
      'This immediately cancels the rental, frees the vehicle and voids open invoices. This cannot be undone.',
    confirmLabel: 'Cancel rental',
    inputLabel: 'Reason (optional)',
  },
}

const STATUS_FILTER_OPTIONS: Array<{ value: RentalStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All Status' },
  ...(Object.entries(RENTAL_STATUS_LABELS) as [RentalStatus, string][]).map(([value, label]) => ({
    value,
    label,
  })),
]

export function RentalPage() {
  const [rentals, setRentals] = useState<RentalWithDetails[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<RentalStatus | 'all'>('all')
  const [actionModal, setActionModal] = useState<ActionModalState | null>(null)
  const [detailsModal, setDetailsModal] = useState<DetailsModalState | null>(null)

  const refresh = useCallback(() => {
    setIsLoading(true)
    setError(null)
    listRentalsWithDetails({ page, pageSize })
      .then((data) => {
        setRentals(data.items)
        setTotal(data.total)
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load rentals'
        setError(msg)
        toast.error(msg)
      })
      .finally(() => setIsLoading(false))
  }, [page, pageSize])

  useEffect(() => {
    refresh()
  }, [refresh])

  const hasLiveRentals = useMemo(
    () => rentals.some((r) => r.status === 'reserved' || r.status === 'active' || r.status === 'past_due'),
    [rentals]
  )
  useLiveListRefresh(() => {
    refresh()
  }, { active: hasLiveRentals })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const rentalRows = useMemo(() => {
    return rentals.map((rental) => {
      const status = rentalStatusLabel(rental.status)
      const customer =
        rental.customer?.name?.trim() ||
        rental.customer?.email?.trim() ||
        '—'
      const vehicle = rental.vehicle?.name?.trim() || '—'

      return {
        rental,
        rentalId: rental.id,
        id: rental.id.slice(0, 8).toUpperCase(),
        customer,
        vehicle,
        period: `${rental.startDate} - ${rental.endDate}`,
        status,
        rawStatus: rental.status,
        monthly: formatCurrency(rental.monthlyAmount ?? 0),
        nextBilling: rental.nextBillingDate ?? '—',
        cancelEffective: rental.cancellationEffectiveDate ?? '—',
        total: formatCurrency(rental.totalAmount),
      }
    })
  }, [rentals])

  const stats = useMemo(() => {
    const active = rentals.filter(
      rental => rental.status === 'active' || rental.status === 'past_due'
    ).length
    const upcoming = rentals.filter(rental => rental.status === 'reserved').length
    const completed = rentals.filter(rental => rental.status === 'completed').length
    const revenue = rentals.reduce((sum, rental) => sum + rental.totalAmount, 0)

    return {
      active,
      upcoming,
      completed,
      revenue,
    }
  }, [rentals])

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rentalRows
    return rentalRows.filter((row) => row.rawStatus === statusFilter)
  }, [rentalRows, statusFilter])

  const handleExport = () => {
    const rows = filteredRows.map(row => ({
      id: row.id,
      customer: row.customer,
      vehicle: row.vehicle,
      period: row.period,
      status: row.status,
      monthly: row.monthly,
      nextBilling: row.nextBilling,
      total: row.total,
    }))
    const headers = ['id', 'customer', 'vehicle', 'period', 'status', 'monthly', 'nextBilling', 'total'] as const
    const csv = [
      headers.join(','),
      ...rows.map(row => headers.map((header) => `"${row[header] ?? ''}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', 'rentals.csv')
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const openAction = (type: RowActionType, rental: RentalWithDetails) => {
    setActionModal({ type, rental, text: '', isSubmitting: false })
  }

  const submitAction = () => {
    if (!actionModal || actionModal.isSubmitting) return
    const { type, rental, text } = actionModal
    const note = text.trim() || undefined
    setActionModal((m) => (m ? { ...m, isSubmitting: true } : m))
    const request =
      type === 'cancel'
        ? cancelRental(rental.id, note)
        : updateRentalStatus(rental.id, type === 'complete' ? 'completed' : 'active', note)
    request
      .then(() => {
        toast.success(
          type === 'cancel'
            ? 'Rental cancelled — vehicle freed and open invoices voided'
            : type === 'complete'
              ? 'Rental marked completed'
              : 'Rental marked active'
        )
        setActionModal(null)
        refresh()
      })
      .catch((err) => {
        // Surface server errors (incl. 409 "Illegal transition x → y") verbatim.
        toast.error(err instanceof Error ? err.message : 'Action failed')
        setActionModal((m) => (m ? { ...m, isSubmitting: false } : m))
      })
  }

  const openDetails = (rentalId: string) => {
    setDetailsModal({ rentalId, data: null, isLoading: true })
    getRentalFull(rentalId)
      .then((data) => {
        setDetailsModal((m) =>
          m && m.rentalId === rentalId ? { ...m, data, isLoading: false } : m
        )
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load rental details')
        setDetailsModal((m) => (m && m.rentalId === rentalId ? null : m))
      })
  }

  if (error && rentals.length === 0) {
    return (
      <AdminLayout title="Rental" subtitle="Track rental activity and reservations">
        <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>{error}</div>
      </AdminLayout>
    )
  }

  const details = detailsModal?.data ?? null

  return (
    <AdminLayout title="Rental" subtitle="Track rental activity and reservations">
      <div className="adminStats">
        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--purple">
              <Car size={18} />
            </div>
          </div>
          <div className="adminStatLabel">Active Rentals</div>
          <div className="adminStatValue">{stats.active}</div>
        </div>
        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--blue">
              <CalendarCheck size={18} />
            </div>
          </div>
          <div className="adminStatLabel">Upcoming Pickups</div>
          <div className="adminStatValue">{stats.upcoming}</div>
        </div>
        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--green">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="adminStatLabel">Completed Rentals</div>
          <div className="adminStatValue">{stats.completed}</div>
        </div>
        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--orange">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="adminStatLabel">Revenue</div>
          <div className="adminStatValue">{formatCurrency(stats.revenue)}</div>
        </div>
      </div>

      <div className="adminTableCard">
        <div className="adminTableHeader">
          <div>
            <div className="adminTableTitle">Recent Rentals</div>
            <div className="adminTableSub">
              <span className="adminLiveDot" />
              Updated just now
            </div>
          </div>
          <div className="adminTableActions">
            <label className="adminSelectBtn">
              <select
                aria-label="Filter rentals by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as RentalStatus | 'all')}
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="adminSelectBtn" type="button" onClick={handleExport}>Export</button>
          </div>
        </div>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
        ) : (
          <>
            <div className="adminTableWrap">
              <table className="adminTable rentalTable">
                <thead>
                  <tr>
                    <th>Rental ID</th>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>Period</th>
                    <th>Monthly</th>
                    <th>Next Billing</th>
                    <th>Cancel Eff.</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.rentalId}>
                      <td className="adminTdStrong">{row.id}</td>
                      <td>{row.customer}</td>
                      <td>{row.vehicle}</td>
                      <td className="adminTdMuted rentalTdCompact">{row.period}</td>
                      <td className="adminTdStrong rentalTdCompact">{row.monthly}</td>
                      <td className="adminTdMuted rentalTdCompact">{row.nextBilling}</td>
                      <td className="adminTdMuted rentalTdCompact">{row.cancelEffective}</td>
                      <td>
                        <span className={STATUS_CLASS[row.rawStatus] ?? 'adminBadge'}>{row.status}</span>
                      </td>
                      <td className="adminTdStrong">{row.total}</td>
                      <td>
                        <div className="rentalRowActions">
                          <button
                            className="rentalAction"
                            type="button"
                            onClick={() => openDetails(row.rentalId)}
                          >
                            Details
                          </button>
                          {row.rawStatus === 'reserved' ? (
                            <button
                              className="rentalAction rentalAction--primary"
                              type="button"
                              onClick={() => openAction('activate', row.rental)}
                            >
                              Mark active
                            </button>
                          ) : null}
                          {row.rawStatus === 'active' || row.rawStatus === 'past_due' ? (
                            <button
                              className="rentalAction rentalAction--primary"
                              type="button"
                              onClick={() => openAction('complete', row.rental)}
                            >
                              Mark completed
                            </button>
                          ) : null}
                          {row.rawStatus === 'reserved' ||
                          row.rawStatus === 'active' ||
                          row.rawStatus === 'past_due' ? (
                            <button
                              className="rentalAction rentalAction--danger"
                              type="button"
                              onClick={() => openAction('cancel', row.rental)}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="customersPagination" role="navigation" aria-label="Rental list pages">
              <button
                type="button"
                className="customersPaginationBtn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="customersPaginationStatus">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="customersPaginationBtn"
                disabled={total === 0 || page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {actionModal ? (
        <div className="adminInfoModalOverlay" role="dialog" aria-modal="true" aria-label={ACTION_COPY[actionModal.type].title}>
          <div className="adminInfoModal">
            <button
              className="adminInfoModalClose"
              type="button"
              onClick={() => setActionModal(null)}
              aria-label="Close"
              disabled={actionModal.isSubmitting}
            >
              <X size={16} />
            </button>
            <h3 className="adminInfoModalTitle">{ACTION_COPY[actionModal.type].title}</h3>
            <p className="adminInfoModalMessage">
              {`Rental ${actionModal.rental.id.slice(0, 8).toUpperCase()} — ${
                actionModal.rental.customer?.name ?? actionModal.rental.customer?.email ?? 'customer'
              } / ${actionModal.rental.vehicle?.name ?? 'vehicle'}.`}
              {'\n'}
              {ACTION_COPY[actionModal.type].message}
            </p>
            <label className="rentalActionField">
              {ACTION_COPY[actionModal.type].inputLabel}
              <textarea
                rows={2}
                value={actionModal.text}
                placeholder={
                  actionModal.type === 'cancel' ? 'Why is this rental being cancelled?' : 'Add a note for the audit trail'
                }
                onChange={(event) =>
                  setActionModal((m) => (m ? { ...m, text: event.target.value } : m))
                }
              />
            </label>
            <div className="adminInfoModalActions">
              <button
                className={`adminInfoModalBtn${actionModal.type === 'cancel' ? ' adminInfoModalBtn--danger' : ''}`}
                type="button"
                disabled={actionModal.isSubmitting}
                onClick={submitAction}
              >
                {actionModal.isSubmitting ? 'Working...' : ACTION_COPY[actionModal.type].confirmLabel}
              </button>
              <button
                className="adminInfoModalBtn"
                type="button"
                onClick={() => setActionModal(null)}
                disabled={actionModal.isSubmitting}
              >
                Keep as is
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailsModal ? (
        <div className="adminInfoModalOverlay" role="dialog" aria-modal="true" aria-label="Rental details">
          <div className="adminInfoModal rentalDetailsModal">
            <button
              className="adminInfoModalClose"
              type="button"
              onClick={() => setDetailsModal(null)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <h3 className="adminInfoModalTitle">
              Rental {detailsModal.rentalId.slice(0, 8).toUpperCase()}
              {details ? (
                <span className={`rentalDetailsStatus ${STATUS_CLASS[details.status] ?? 'adminBadge'}`}>
                  {rentalStatusLabel(details.status)}
                </span>
              ) : null}
            </h3>
            {detailsModal.isLoading ? (
              <div className="rentalDetailsLoading">Loading rental details...</div>
            ) : details ? (
              <div className="rentalDetailsBody">
                <div className="rentalDetailsGrid">
                  <div>
                    <span>Customer</span>
                    <strong>{details.customer?.name ?? details.customer?.email ?? '—'}</strong>
                  </div>
                  <div>
                    <span>Vehicle</span>
                    <strong>{details.vehicle?.name ?? '—'}</strong>
                  </div>
                  <div>
                    <span>Dealer</span>
                    <strong>{details.dealer?.name ?? '—'}</strong>
                  </div>
                  <div>
                    <span>Period</span>
                    <strong>
                      {details.startDate} → {details.endDate}
                    </strong>
                  </div>
                  <div>
                    <span>Monthly</span>
                    <strong>{formatCurrency(details.monthlyAmount ?? 0)}</strong>
                  </div>
                  <div>
                    <span>Term</span>
                    <strong>{details.termMonths ?? '—'} months</strong>
                  </div>
                  <div>
                    <span>Next billing</span>
                    <strong>{details.nextBillingDate ?? '—'}</strong>
                  </div>
                  <div>
                    <span>Cancellation effective</span>
                    <strong>{details.cancellationEffectiveDate ?? '—'}</strong>
                  </div>
                  <div>
                    <span>Total</span>
                    <strong>{formatCurrency(details.totalAmount)}</strong>
                  </div>
                  {details.cancelReason ? (
                    <div className="rentalDetailsGridWide">
                      <span>Cancel reason</span>
                      <strong>{details.cancelReason}</strong>
                    </div>
                  ) : null}
                  {(details.depositAmount ?? 0) > 0 ? (
                    <>
                      <div>
                        <span>Deposit held</span>
                        <strong>{formatCurrency(details.depositAmount ?? 0)}</strong>
                      </div>
                      {details.depositResolvedAt ? (
                        <>
                          <div>
                            <span>Deposit released</span>
                            <strong>{formatCurrency(details.depositResolvedAmount ?? 0)}</strong>
                          </div>
                          <div>
                            <span>Deposit withheld</span>
                            <strong>{formatCurrency(details.depositWithheldAmount ?? 0)}</strong>
                          </div>
                          {details.depositResolutionNote ? (
                            <div className="rentalDetailsGridWide">
                              <span>Deposit note</span>
                              <strong>{details.depositResolutionNote}</strong>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <section className="rentalDetailsSection">
                  <h4>Events timeline</h4>
                  {details.events.length === 0 ? (
                    <div className="rentalDetailsEmpty">No events recorded.</div>
                  ) : (
                    <ul className="rentalTimeline">
                      {details.events.map((event) => (
                        <li key={event.id}>
                          <span className="rentalTimelineDot" aria-hidden="true" />
                          <div>
                            <div className="rentalTimelineHead">
                              <strong>{event.type.replace('_', ' ')}</strong>
                              <span>{formatDate(event.createdAt)}</span>
                            </div>
                            <div className="rentalTimelineMeta">
                              {event.mileage != null ? `Mileage ${event.mileage} km · ` : ''}
                              {event.fuelLevel ? `Fuel ${event.fuelLevel} · ` : ''}
                              {event.conditionNotes ?? ''}
                            </div>
                            {event.photos?.length ? (
                              <div className="rentalEventPhotos">
                                {event.photos.map((url, index) => (
                                  <a
                                    key={`${event.id}-${index}`}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rentalEventPhotoLink"
                                    aria-label={`Open condition photo ${index + 1}`}
                                  >
                                    <img src={url} alt={`Vehicle condition ${index + 1}`} loading="lazy" />
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rentalDetailsSection">
                  <h4>Invoices</h4>
                  {details.invoices.length === 0 ? (
                    <div className="rentalDetailsEmpty">No invoices.</div>
                  ) : (
                    <div className="rentalDetailsList">
                      {details.invoices.map((invoice) => (
                        <div key={invoice.id} className="rentalDetailsListRow">
                          <div>
                            <strong>{invoice.description}</strong>
                            <span>
                              {invoice.periodStart && invoice.periodEnd
                                ? `${invoice.periodStart} → ${invoice.periodEnd}`
                                : invoice.date}
                            </span>
                          </div>
                          <div className="rentalDetailsListRight">
                            <strong>{formatCurrency(invoice.amount)}</strong>
                            <span className={`adminBadge rentalInvoiceBadge--${invoice.status}`}>
                              {invoice.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rentalDetailsSection">
                  <h4>Payments</h4>
                  {details.payments.length === 0 ? (
                    <div className="rentalDetailsEmpty">No payments.</div>
                  ) : (
                    <div className="rentalDetailsList">
                      {details.payments.map((payment) => (
                        <div key={payment.id} className="rentalDetailsListRow">
                          <div>
                            <strong>
                              {payment.id.slice(0, 8).toUpperCase()}
                              {payment.type === 'refund' ? ' · Refund' : ''}
                            </strong>
                            <span>
                              {formatDate(payment.createdAt)} · {payment.method}
                            </span>
                          </div>
                          <div className="rentalDetailsListRight">
                            <strong className={payment.type === 'refund' ? 'rentalAmountNegative' : ''}>
                              {payment.type === 'refund' ? '−' : ''}
                              {formatCurrency(payment.amount)}
                            </strong>
                            <span className="adminBadge adminBadge--blue">{payment.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rentalDetailsSection">
                  <h4>Audit trail</h4>
                  {details.auditTrail.length === 0 ? (
                    <div className="rentalDetailsEmpty">No audit entries.</div>
                  ) : (
                    <div className="rentalDetailsList">
                      {details.auditTrail.map((entry) => (
                        <details key={entry.id} className="rentalAuditEntry">
                          <summary>
                            <span className="rentalAuditAction">{entry.action}</span>
                            <span className="rentalAuditMeta">
                              {entry.actorName ?? entry.actorRole ?? 'system'} ·{' '}
                              {formatDate(entry.createdAt)}
                            </span>
                          </summary>
                          {entry.note ? <p className="rentalAuditNote">{entry.note}</p> : null}
                          <div className="rentalAuditDiff">
                            <div>
                              <span>Before</span>
                              <pre>{JSON.stringify(entry.before ?? null, null, 2)}</pre>
                            </div>
                            <div>
                              <span>After</span>
                              <pre>{JSON.stringify(entry.after ?? null, null, 2)}</pre>
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <div className="rentalDetailsEmpty">Details unavailable.</div>
            )}
          </div>
        </div>
      ) : null}
    </AdminLayout>
  )
}
