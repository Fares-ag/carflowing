import { useEffect, useMemo, useState } from 'react'
import type { Rental, Vehicle } from '@carflow/shared'
import { formatCurrency } from '@carflow/shared'
import { listRentals, listVehicles } from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import { InfoModal } from '../components/InfoModal'
import { CalendarCheck, Car, CheckCircle2, CreditCard, TrendingDown, TrendingUp } from 'lucide-react'

const STATUS_CLASS: Record<string, string> = {
  Active: 'adminBadge adminBadge--green',
  Scheduled: 'adminBadge adminBadge--blue',
  Completed: 'adminBadge adminBadge--amber',
  Cancelled: 'adminBadge adminBadge--red'
}

export function RentalPage() {
  const [rentals, setRentals] = useState<Rental[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    Promise.all([listRentals({ pageSize: 12 }), listVehicles({ pageSize: 12 })]).then(
      ([rentalData, vehicleData]) => {
        setRentals(rentalData.items)
        setVehicles(vehicleData.items)
      }
    )
  }, [])

  const rentalRows = useMemo(() => {
    const vehicleMap = new Map(vehicles.map(vehicle => [vehicle.id, vehicle]))
    return rentals.map((rental, index) => {
      const vehicle = vehicleMap.get(rental.vehicleId)
      const status =
        rental.status === 'active'
          ? 'Active'
          : rental.status === 'reserved'
          ? 'Scheduled'
          : rental.status === 'completed'
          ? 'Completed'
          : 'Cancelled'

      return {
        id: `R-${1000 + index}`,
        customer: `Customer ${index + 1}`,
        vehicle: vehicle ? vehicle.name : 'Vehicle',
        period: `${rental.startDate} - ${rental.endDate}`,
        status,
        total: formatCurrency(rental.totalAmount),
      }
    })
  }, [rentals, vehicles])

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
    const headers = Object.keys(rows[0] ?? {})
    const csv = [
      headers.join(','),
      ...rows.map(row => headers.map(header => `"${row[header] ?? ''}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', 'rentals.csv')
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <AdminLayout title="Rental" subtitle="Track rental activity and reservations">
      <div className="adminStats">
        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--purple">
              <Car size={18} />
            </div>
            <span className="adminDelta adminDelta--up">
              <TrendingUp size={12} />
              +12%
            </span>
          </div>
          <div className="adminStatLabel">Active Rentals</div>
          <div className="adminStatValue">{stats.active}</div>
          <div className="adminStatMeta">Compared to last week</div>
        </div>
        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--blue">
              <CalendarCheck size={18} />
            </div>
            <span className="adminDelta adminDelta--up">
              <TrendingUp size={12} />
              +5%
            </span>
          </div>
          <div className="adminStatLabel">Upcoming Pickups</div>
          <div className="adminStatValue">{stats.upcoming}</div>
          <div className="adminStatMeta">Next 7 days</div>
        </div>
        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--green">
              <CheckCircle2 size={18} />
            </div>
            <span className="adminDelta adminDelta--up">
              <TrendingUp size={12} />
              +9%
            </span>
          </div>
          <div className="adminStatLabel">Completed Rentals</div>
          <div className="adminStatValue">{stats.completed}</div>
          <div className="adminStatMeta">This month</div>
        </div>
        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--orange">
              <CreditCard size={18} />
            </div>
            <span className="adminDelta adminDelta--down">
              <TrendingDown size={12} />
              -3%
            </span>
          </div>
          <div className="adminStatLabel">Revenue</div>
          <div className="adminStatValue">{formatCurrency(stats.revenue)}</div>
          <div className="adminStatMeta">Rental income</div>
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
                <tr key={row.id}>
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
