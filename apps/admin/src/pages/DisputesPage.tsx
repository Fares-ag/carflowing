import { formatCurrency, formatDate } from '@carflow/shared'
import { AlertTriangle, Plus } from 'lucide-react'
import type { FormEvent} from 'react';
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { AdminLayout } from '../layout/AdminLayout'
import {
  createDispute,
  listDisputes,
  updateDispute,
  type DisputeStatus,
  type PaymentDispute,
} from '../services/adminService'
import './DisputesPage.css'

const PAGE_SIZE = 20
const STATUSES: DisputeStatus[] = ['open', 'investigating', 'won', 'lost', 'closed']

export function DisputesPage() {
  const { session } = useAuth()
  const canMutate = session?.role === 'admin' || session?.role === 'finance'
  const [disputes, setDisputes] = useState<PaymentDispute[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [paymentId, setPaymentId] = useState('')
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    listDisputes({
      page,
      pageSize: PAGE_SIZE,
      status: statusFilter === 'all' ? undefined : statusFilter,
    })
      .then((data) => {
        setDisputes(data.items)
        setTotal(data.total)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load disputes'))
      .finally(() => setLoading(false))
  }, [page, statusFilter])

  useEffect(() => {
    refresh()
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!paymentId.trim() || !reason.trim()) {
      toast.error('Payment ID and reason are required')
      return
    }
    setSubmitting(true)
    try {
      await createDispute({
        paymentId: paymentId.trim(),
        reason: reason.trim(),
        amount: amount ? Number(amount) : undefined,
      })
      toast.success('Dispute opened')
      setShowForm(false)
      setPaymentId('')
      setReason('')
      setAmount('')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to create dispute')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusChange = async (dispute: PaymentDispute, status: DisputeStatus) => {
    setBusyId(dispute.id)
    try {
      await updateDispute(dispute.id, { status })
      toast.success(`Dispute marked ${status}`)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update dispute')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AdminLayout title="Disputes" subtitle="Chargeback and payment dispute workflow">
      <div className="disputesPage">
        <div className="disputesToolbar">
          <label className="disputesFilter">
            Status
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as DisputeStatus | 'all')
                setPage(1)
              }}
            >
              <option value="all">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {canMutate ? (
            <button type="button" className="disputesAddBtn" onClick={() => setShowForm(true)}>
              <Plus size={14} />
              Open dispute
            </button>
          ) : null}
        </div>

        {showForm && canMutate ? (
          <form className="disputesForm" onSubmit={handleCreate}>
            <h2 className="disputesFormTitle">
              <AlertTriangle size={16} />
              New dispute
            </h2>
            <div className="disputesFormGrid">
              <label className="disputesField">
                Payment ID
                <input value={paymentId} onChange={(e) => setPaymentId(e.target.value)} required />
              </label>
              <label className="disputesField">
                Amount (optional)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="disputesField disputesField--full">
                Reason
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required />
              </label>
            </div>
            <div className="disputesFormActions">
              <button type="button" className="disputesBtn secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="disputesBtn primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create dispute'}
              </button>
            </div>
          </form>
        ) : null}

        <div className="disputesTableCard">
          {loading ? (
            <div className="disputesEmpty">Loading disputes…</div>
          ) : disputes.length === 0 ? (
            <div className="disputesEmpty">No disputes found.</div>
          ) : (
            <>
              <div className="disputesTableWrap">
                <table className="disputesTable">
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th>Reason</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Created</th>
                      {canMutate ? <th>Update</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {disputes.map((dispute) => (
                      <tr key={dispute.id}>
                        <td>{dispute.paymentId.slice(0, 8)}</td>
                        <td>{dispute.reason}</td>
                        <td>{formatCurrency(dispute.amount)}</td>
                        <td>
                          <span className={`disputesStatus disputesStatus--${dispute.status}`}>
                            {dispute.status}
                          </span>
                        </td>
                        <td>{formatDate(dispute.createdAt)}</td>
                        {canMutate ? (
                          <td>
                            <select
                              className="disputesStatusSelect"
                              value={dispute.status}
                              disabled={busyId === dispute.id}
                              onChange={(e) =>
                                handleStatusChange(dispute, e.target.value as DisputeStatus)
                              }
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="customersPagination">
                <button
                  type="button"
                  className="customersPaginationBtn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span className="customersPaginationStatus">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="customersPaginationBtn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
