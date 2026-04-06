import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@carflow/shared'
import { toast } from 'sonner'
import { listRentalsWithDetails, type RentalWithDetails } from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import { InfoModal } from '../components/InfoModal'
import { CalendarCheck, Car, CheckCircle2, CreditCard } from 'lucide-react'

const STATUS_CLASS: Record<string, string> = {
  Active: 'adminBadge adminBadge--green',
  Scheduled: 'adminBadge adminBadge--blue',
  Completed: 'adminBadge adminBadge--amber',
  Cancelled: 'adminBadge adminBadge--red'
}

export function RentalPage() {
  const [rentals, setRentals] = useState<RentalWithDetails[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const rentalRows = useMemo(() => {
    return rentals.map((rental) => {
      const status =
        rental.status === 'active'
          ? 'Active'
          : rental.status === 'reserved'
          ? 'Scheduled'
          : rental.status === 'completed'
          ? 'Completed'
          : 'Cancelled'

      const customer =
        rental.customer?.name?.trim() ||
        rental.customer?.email?.trim() ||
        '—'
      const vehicle = rental.vehicle?.name?.trim() || '—'

      return {
        rentalId: rental.id,
        id: rental.id.slice(0, 8).toUpperCase(),
        customer,
        vehicle,
        period: `${rental.startDate} - ${rental.endDate}`,
        status,
        total: formatCurrency(rental.totalAmount),
      }
    })
  }, [rentals])

  const stats = useMemo(() => {
    const active = rentals.filter(rental => rental.status === 'active').length
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
    const normalized = statusFilter.toLowerCase()
    if (normalized === 'all') return rentalRows
    return rentalRows.filter(row => row.status.toLowerCase() === normalized)
  }, [rentalRows, statusFilter])

  const handleExport = () => {
    const rows = filteredRows.map(row => ({
      id: row.id,
      customer: row.customer,
      vehicle: row.vehicle,
      period: row.period,
      status: row.status,
      total: row.total,
    }))
    const headers = ['id', 'customer', 'vehicle', 'period', 'status', 'total'] as const
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

  if (error && rentals.length === 0) {
    return (
      <AdminLayout title="Rental" subtitle="Track rental activity and reservations">
        <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>{error}</div>
      </AdminLayout>
    )
  }

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
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All Status</option>
                <option value="Active">Active</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
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
              <table className="adminTable">
                <thead>
                  <tr>
                    <th>Rental ID</th>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.rentalId}>
                      <td className="adminTdStrong">{row.id}</td>
                      <td>{row.customer}</td>
                      <td>{row.vehicle}</td>
                      <td className="adminTdMuted">{row.period}</td>
                      <td>
                        <span className={STATUS_CLASS[row.status]}>{row.status}</span>
                      </td>
                      <td className="adminTdStrong">{row.total}</td>
                      <td>
                        <button
                          className="adminKebab"
                          type="button"
                          onClick={() =>
                            setInfoModal({
                              title: `Rental ${row.id}`,
                              message: `Customer: ${row.customer}\nStatus: ${row.status}`,
                            })
                          }
                        >
                          ⋮
                        </button>
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
      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
    </AdminLayout>
  )
}
