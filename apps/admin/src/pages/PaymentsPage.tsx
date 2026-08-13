import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@carflow/shared'
import { toast } from 'sonner'
import {
  getPaymentSummary,
  listPaymentsWithDetails,
  refundPayment,
  type PaymentSummary,
  type PaymentWithDetails,
} from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import { InfoModal } from '../components/InfoModal'
import {
  ArrowDownToLine,
  BadgeCheck,
  BadgeX,
  Car,
  CheckCircle,
  ChevronDown,
  CircleDollarSign,
  Clock,
  MoreVertical,
  Search,
  SlidersHorizontal,
  User,
  WalletCards,
} from 'lucide-react'
import './PaymentsPage.css'

const downloadCsv = (filename: string, rows: Array<Record<string, string>>) => {
  const headers = Object.keys(rows[0] ?? {})
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(header => `"${row[header] ?? ''}"`).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentWithDetails[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [methodFilter, setMethodFilter] = useState('all')
  const [minAmount, setMinAmount] = useState('')
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [refundingId, setRefundingId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setIsLoading(true)
    setError(null)
    Promise.all([
      listPaymentsWithDetails({ page, pageSize }),
      getPaymentSummary(),
    ])
      .then(([data, summaryData]) => {
        setPayments(data.items)
        setTotal(data.total)
        setSummary(summaryData)
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load payments'
        setError(msg)
        toast.error(msg)
      })
      .finally(() => setIsLoading(false))
  }, [page, pageSize])

  useEffect(() => {
    refresh()
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const stats = useMemo(() => {
    if (!summary) {
      return []
    }
    return [
      {
        label: 'Total Revenue',
        value: formatCurrency(summary.totalRevenue),
        sub: 'From completed payments',
        icon: <CircleDollarSign size={18} />,
        badgeTone: 'success' as const,
        iconTone: 'green' as const,
      },
      {
        label: 'Pending Payments',
        value: String(summary.pendingCount),
        sub: 'Awaiting confirmation',
        icon: <Clock size={18} />,
        badgeIcon: <BadgeX size={14} />,
        badge: String(summary.pendingCount),
        badgeTone: 'warning' as const,
        iconTone: 'amber' as const,
      },
      {
        label: 'Completed',
        value: String(summary.completedCount),
        sub: 'Successful transactions',
        icon: <CheckCircle size={18} />,
        badgeTone: 'purple' as const,
        iconTone: 'purple' as const,
      },
      {
        label: 'Refunds',
        value: String(summary.refundedCount),
        sub: summary.needsRefundCount
          ? `${summary.needsRefundCount} need manual refund`
          : 'Total refunded transactions',
        icon: <WalletCards size={18} />,
        badgeIcon: <BadgeX size={14} />,
        badge: formatCurrency(summary.refundTotal),
        badgeTone: 'danger' as const,
        iconTone: 'violet' as const,
      },
    ]
  }, [summary])

  const transactions = useMemo(() => {
    return payments.map((payment) => {
      const created = new Date(payment.createdAt)
      const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000))
      const customer =
        payment.customer?.name?.trim() ||
        payment.customer?.email?.trim() ||
        '—'
      const car = payment.type === 'subscription' ? 'Plan subscription' : '—'
      return {
        paymentId: payment.id,
        id: payment.id.slice(0, 8).toUpperCase(),
        status: payment.status,
        type: payment.type,
        customer,
        car,
        time: created.toLocaleString('en-US'),
        method: payment.method.replace('_', ' '),
        amount: formatCurrency(payment.amount),
        age: `${days} day${days === 1 ? '' : 's'}`,
        needsRefund: payment.needsRefund === true,
      }
    })
  }, [payments])

  const filteredTransactions = useMemo(() => {
    const normalizedStatus = statusFilter.toLowerCase()
    const normalizedType = typeFilter.toLowerCase()
    const normalizedMethod = methodFilter.toLowerCase()
    const min = Number(minAmount) || 0
    const base = transactions.filter(txn => {
      const statusOk = normalizedStatus === 'all' || txn.status.toLowerCase() === normalizedStatus
      const typeOk = normalizedType === 'all' || txn.type.toLowerCase() === normalizedType
      const methodOk = normalizedMethod === 'all' || txn.method.toLowerCase().includes(normalizedMethod)
      const amountValue = Number(txn.amount.replace(/[^\d.]/g, '')) || 0
      const amountOk = min === 0 || amountValue >= min
      return statusOk && typeOk && methodOk && amountOk
    })
    if (!searchQuery.trim()) return base
    const query = searchQuery.toLowerCase()
    return base.filter(txn =>
      [txn.id, txn.customer, txn.car, txn.method].some(value => value.toLowerCase().includes(query))
    )
  }, [transactions, searchQuery, statusFilter, typeFilter, methodFilter, minAmount])

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(transactions.map(txn => txn.status)))
    return ['all', ...values]
  }, [transactions])

  const typeOptions = useMemo(() => {
    const values = Array.from(new Set(transactions.map(txn => txn.type)))
    return ['all', ...values]
  }, [transactions])

  if (error && payments.length === 0) {
    return (
      <AdminLayout title="Payments" subtitle="Payment transactions and history">
        <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>{error}</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title="Payments" subtitle="Payment transactions and history">
      <div className="paymentsPage">
        <div className="paymentsIntro">
          <p>Monitor and manage all payment transactions</p>
          <button
            className="paymentsExport"
            type="button"
            onClick={() => {
              downloadCsv(
                'payments.csv',
                filteredTransactions.map(txn => ({
                  id: txn.id,
                  status: txn.status,
                  type: txn.type,
                  customer: txn.customer,
                  amount: txn.amount,
                  method: txn.method,
                }))
              )
            }}
          >
            <ArrowDownToLine size={16} />
            Export
          </button>
        </div>

        <div className="paymentsStats">
          {stats.map((stat) => (
            <div key={stat.label} className="paymentsStatCard">
              <div className="paymentsStatTop">
                <div className={`paymentsStatIcon paymentsStatIcon--${stat.iconTone}`}>
                  {stat.icon}
                </div>
                {'badge' in stat && stat.badge != null ? (
                  <div className={`paymentsStatBadge paymentsStatBadge--${stat.badgeTone}`}>
                    {stat.badgeIcon}
                    {stat.badge}
                  </div>
                ) : null}
              </div>
              <div className="paymentsStatLabel">{stat.label}</div>
              <div className="paymentsStatValue">{stat.value}</div>
              <div className="paymentsStatSub">{stat.sub}</div>
            </div>
          ))}
        </div>

        <div className="paymentsFilters">
          <div className="paymentsSearch">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by transaction ID, customer, or car..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <label className="paymentsSelect">
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {statusOptions.map(option => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All Statuses' : option}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <label className="paymentsSelect">
            <select
              aria-label="Filter by type"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              {typeOptions.map(option => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All Types' : option}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <button
            className="paymentsMoreFilters"
            type="button"
            onClick={() => setShowMoreFilters((prev) => !prev)}
          >
            <SlidersHorizontal size={14} />
            {showMoreFilters ? 'Hide Filters' : 'More Filters'}
          </button>
        </div>
        {showMoreFilters && (
          <div className="paymentsFiltersRow">
            <label className="paymentsSelect">
              <select
                aria-label="Filter by payment method"
                value={methodFilter}
                onChange={(event) => setMethodFilter(event.target.value)}
              >
                <option value="all">All Methods</option>
                <option value="card">Card</option>
                <option value="bank">Bank Transfer</option>
                <option value="wallet">Wallet</option>
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="paymentsSelect">
              <input
                type="number"
                min="0"
                placeholder="Min amount"
                value={minAmount}
                onChange={(event) => setMinAmount(event.target.value)}
              />
            </label>
          </div>
        )}

        <div className="paymentsTransactions">
          <div className="paymentsTransactionsHeader">
            <div className="paymentsTransactionsTitle">Payment Transactions</div>
            <div className="paymentsTransactionsSub">View and manage all payment transactions</div>
          </div>
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
          ) : (
            <>
              <div className="paymentsTransactionsBody">
                {filteredTransactions.map((txn) => (
                  <div key={txn.paymentId} className="paymentsRow">
                    <div className="paymentsRowLeft">
                      <div className="paymentsRowIcon">
                        {txn.status === 'pending' ? <Clock size={16} /> : txn.status === 'refunded' ? <WalletCards size={16} /> : <BadgeCheck size={16} />}
                      </div>
                      <div className="paymentsRowDetails">
                        <div className="paymentsRowMeta">
                          <span className="paymentsRowId">{txn.id}</span>
                          <span className={`paymentsBadge paymentsBadge--${txn.status}`}>{txn.status}</span>
                          <span className="paymentsBadge paymentsBadge--type">{txn.type}</span>
                        </div>
                        <div className="paymentsRowInfo">
                          <div className="paymentsRowItem">
                            <User size={14} />
                            {txn.customer}
                          </div>
                          <div className="paymentsRowItem">
                            <Car size={14} />
                            {txn.car}
                          </div>
                          <div className="paymentsRowItem">
                            <Clock size={14} />
                            {txn.time}
                          </div>
                          <div className="paymentsRowItem">
                            <WalletCards size={14} />
                            {txn.method}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="paymentsRowRight">
                      <div className="paymentsRowAmount">
                        <div>{txn.amount}</div>
                        {txn.needsRefund ? <span className="paymentsBadge paymentsBadge--failed">needs refund</span> : null}
                        {txn.age && <span>{txn.age}</span>}
                      </div>
                      {txn.needsRefund || txn.status === 'failed' ? (
                        <button
                          className="paymentsRowAction"
                          type="button"
                          disabled={refundingId === txn.paymentId}
                          onClick={() => {
                            setRefundingId(txn.paymentId)
                            refundPayment(txn.paymentId)
                              .then(() => {
                                toast.success('Payment marked refunded')
                                refresh()
                              })
                              .catch((err) =>
                                toast.error(err instanceof Error ? err.message : 'Refund failed')
                              )
                              .finally(() => setRefundingId(null))
                          }}
                        >
                          Refund
                        </button>
                      ) : null}
                      <button
                        className="paymentsRowAction"
                        type="button"
                        onClick={() =>
                          setInfoModal({
                            title: `Transaction ${txn.id}`,
                            message: `Status: ${txn.status}\nAmount: ${txn.amount}`,
                          })
                        }
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="customersPagination" role="navigation" aria-label="Payment list pages">
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
      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
    </AdminLayout>
  )
}
