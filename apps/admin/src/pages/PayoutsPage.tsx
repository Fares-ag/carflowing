import { formatCurrency, formatDate, formatDateOrDash } from '@carflow/shared'
import { CircleDollarSign, RefreshCw, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { AdminLayout } from '../layout/AdminLayout'
import {
  generatePayouts,
  listPayouts,
  markPayoutPaid,
  type AdminPayout,
} from '../services/adminService'
import './PayoutsPage.css'

export function PayoutsPage() {
  const { session } = useAuth()
  const canMutate = session?.role === 'admin' || session?.role === 'finance'
  const [payouts, setPayouts] = useState<AdminPayout[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const refresh = useCallback(() => {
    setIsLoading(true)
    listPayouts({ page, pageSize })
      .then((data) => {
        setPayouts(data.items)
        setTotal(data.total)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load payouts'))
      .finally(() => setIsLoading(false))
  }, [page, pageSize])

  useEffect(() => {
    refresh()
  }, [refresh])

  const stats = useMemo(() => {
    const pending = payouts.filter((p) => p.status === 'pending')
    const paid = payouts.filter((p) => p.status === 'paid')
    return {
      pendingCount: pending.length,
      pendingTotal: pending.reduce((sum, p) => sum + p.amount, 0),
      paidCount: paid.length,
    }
  }, [payouts])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const result = await generatePayouts()
      toast.success(`Generated ${result.created} payout batch${result.created === 1 ? '' : 'es'}`)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to generate payouts')
    } finally {
      setGenerating(false)
    }
  }

  const handleMarkPaid = async (payout: AdminPayout) => {
    setBusyId(payout.id)
    try {
      await markPayoutPaid(payout.id)
      toast.success(`Marked payout to ${payout.dealerName} as paid`)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to mark payout paid')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AdminLayout title="Payouts" subtitle="Dealer settlement batches">
      <div className="payoutsPage">
        <div className="payoutsIntro">
          <p>
            Dealers need verified bank details before they appear in generated batches. Unverified or
            missing IBAN dealers are skipped automatically.
          </p>
          {canMutate ? (
            <button
              type="button"
              className="payoutsGenerateBtn"
              disabled={generating}
              onClick={handleGenerate}
            >
              <RefreshCw size={16} />
              {generating ? 'Generating…' : 'Generate payouts'}
            </button>
          ) : null}
        </div>

        <div className="payoutsStats">
          <div className="payoutsStatCard">
            <Wallet size={18} />
            <div>
              <div className="payoutsStatLabel">Pending (this page)</div>
              <div className="payoutsStatValue">{stats.pendingCount}</div>
            </div>
          </div>
          <div className="payoutsStatCard">
            <CircleDollarSign size={18} />
            <div>
              <div className="payoutsStatLabel">Pending amount</div>
              <div className="payoutsStatValue">{formatCurrency(stats.pendingTotal)}</div>
            </div>
          </div>
          <div className="payoutsStatCard">
            <div>
              <div className="payoutsStatLabel">Paid (this page)</div>
              <div className="payoutsStatValue">{stats.paidCount}</div>
            </div>
          </div>
        </div>

        <div className="payoutsTableCard">
          {isLoading ? (
            <div className="payoutsLoading">Loading payouts…</div>
          ) : payouts.length === 0 ? (
            <div className="payoutsEmpty">No payout batches yet.</div>
          ) : (
            <>
              <div className="payoutsTableWrap">
                <table className="payoutsTable">
                  <thead>
                    <tr>
                      <th>Dealer</th>
                      <th>Period</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Created</th>
                      {canMutate ? <th aria-label="Actions" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((payout) => (
                      <tr key={payout.id}>
                        <td>{payout.dealerName}</td>
                        <td>
                          {payout.periodStart && payout.periodEnd
                            ? `${payout.periodStart} → ${payout.periodEnd}`
                            : '—'}
                        </td>
                        <td>{formatCurrency(payout.amount)}</td>
                        <td>
                          <span
                            className={`payoutsStatus payoutsStatus--${payout.status === 'paid' ? 'paid' : 'pending'}`}
                          >
                            {payout.status}
                          </span>
                        </td>
                        <td>{formatDate(payout.createdAt)}</td>
                        {canMutate ? (
                          <td>
                            {payout.status === 'pending' ? (
                              <button
                                type="button"
                                className="payoutsMarkPaidBtn"
                                disabled={busyId === payout.id}
                                onClick={() => handleMarkPaid(payout)}
                              >
                                Mark paid
                              </button>
                            ) : (
                              formatDateOrDash(payout.paidAt)
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="customersPagination" role="navigation" aria-label="Payout list pages">
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
      </div>
    </AdminLayout>
  )
}
