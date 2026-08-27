import { formatCurrency, formatDate, formatDateOrDash } from '@carflow/shared'
import { CircleDollarSign, TrendingUp, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import {
  getDealerEarnings,
  listDealerPayouts,
  type DealerEarnings,
  type DealerPayout,
} from '../services/dealerService'
import './PayoutsPage.css'

const PAGE_SIZE = 10

export function PayoutsPage() {
  const [payouts, setPayouts] = useState<DealerPayout[]>([])
  const [earnings, setEarnings] = useState<DealerEarnings | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    Promise.all([listDealerPayouts({ page, pageSize: PAGE_SIZE }), getDealerEarnings()])
      .then(([payoutData, earningsData]) => {
        setPayouts(payoutData.items)
        setTotal(payoutData.total)
        setEarnings(earningsData)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load payouts'))
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => {
    refresh()
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const statusEntries = useMemo(
    () => Object.entries(earnings?.byStatus ?? {}),
    [earnings?.byStatus]
  )

  return (
    <div className="dealer-payouts-page">
      <Sidebar />
      <Header />
      <div className="dealer-payouts-content" role="main">
        <div className="page-header">
          <div>
            <h1 className="page-title">Payouts & Earnings</h1>
            <p className="page-subtitle">Commission ledger and settlement history</p>
          </div>
        </div>

        <div className="dealer-payouts-stats">
          <div className="dealer-payouts-stat">
            <Wallet size={18} />
            <div>
              <div className="dealer-payouts-stat-label">Pending payout total</div>
              <div className="dealer-payouts-stat-value">
                {formatCurrency(earnings?.pendingPayoutTotal ?? 0)}
              </div>
            </div>
          </div>
          <div className="dealer-payouts-stat">
            <TrendingUp size={18} />
            <div>
              <div className="dealer-payouts-stat-label">Ledger statuses</div>
              <div className="dealer-payouts-stat-value">{statusEntries.length}</div>
            </div>
          </div>
          <div className="dealer-payouts-stat">
            <CircleDollarSign size={18} />
            <div>
              <div className="dealer-payouts-stat-label">Payout batches</div>
              <div className="dealer-payouts-stat-value">{total}</div>
            </div>
          </div>
        </div>

        {statusEntries.length > 0 ? (
          <div className="dealer-earnings-card">
            <h2 className="dealer-earnings-title">Earnings by status</h2>
            <div className="dealer-earnings-grid">
              {statusEntries.map(([status, amounts]) => (
                <div key={status} className="dealer-earnings-item">
                  <div className="dealer-earnings-status">{status}</div>
                  <div>Gross: {formatCurrency(amounts.gross)}</div>
                  <div>Net: {formatCurrency(amounts.net)}</div>
                  <div>Commission: {formatCurrency(amounts.commission)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="dealer-payouts-table-card">
          {loading ? (
            <div className="dealer-payouts-empty">Loading payouts…</div>
          ) : payouts.length === 0 ? (
            <div className="dealer-payouts-empty">No payout batches yet.</div>
          ) : (
            <>
              <div className="dealer-payouts-table-wrap">
                <table className="dealer-payouts-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Paid</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((payout) => (
                      <tr key={payout.id}>
                        <td>
                          {payout.periodStart && payout.periodEnd
                            ? `${payout.periodStart} → ${payout.periodEnd}`
                            : '—'}
                        </td>
                        <td>{formatCurrency(payout.amount)}</td>
                        <td>
                          <span
                            className={`dealer-payouts-status dealer-payouts-status--${payout.status === 'paid' ? 'paid' : 'pending'}`}
                          >
                            {payout.status}
                          </span>
                        </td>
                        <td>
                          {formatDateOrDash(payout.paidAt)}
                        </td>
                        <td>
                          {formatDate(payout.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dealer-payouts-pagination">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
