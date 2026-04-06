import { useEffect, useMemo, useState } from 'react'
import type { Dealer, Vehicle } from '@carflow/shared'
import { createVehicle, deleteVehicle, listDealers, listRentalsWithDetails, listVehicles, updateRentalStatus } from '../services/adminService'
import type { RentalWithDetails } from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import { AddCarModal } from '../components/AddCarModal'
import { InfoModal } from '../components/InfoModal'
import { Check, Download, Eye, Filter, Search, Settings, Timer, Trash2, Truck, Users } from 'lucide-react'
import './CarsPage.css'

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

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
type RequestStatus = 'PENDING' | 'IN PROGRESS' | 'APPROVED'

interface RequestRow {
  id: string
  sourceId: string
  createdAt: string
  dealer: string
  customerName: string
  customerEmail: string
  customerInitial: string
  vehicle: string
  vehicleYear: string
  rentalPeriod: string
  rentalDuration: string
  priority: Priority
  status: RequestStatus
  timeAgo: string
}

function priorityClass(priority: Priority) {
  if (priority === 'URGENT') return 'carsBadgePriority carsBadgePriority--urgent'
  if (priority === 'HIGH') return 'carsBadgePriority carsBadgePriority--high'
  if (priority === 'MEDIUM') return 'carsBadgePriority carsBadgePriority--medium'
  return 'carsBadgePriority carsBadgePriority--low'
}

function statusClass(status: RequestStatus) {
  if (status === 'APPROVED') return 'carsBadgeStatus carsBadgeStatus--approved'
  if (status === 'IN PROGRESS') return 'carsBadgeStatus carsBadgeStatus--progress'
  return 'carsBadgeStatus carsBadgeStatus--pending'
}

export function CarsPage() {
  const [rentals, setRentals] = useState<RentalWithDetails[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [showAddModal, setShowAddModal] = useState(false)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)

  const refreshRequests = () => {
    Promise.all([
      listRentalsWithDetails({ pageSize: 50 }),
      listVehicles({ pageSize: 100 }),
      listDealers({ pageSize: 100 }),
    ]).then(([rentalData, vehicleData, dealerData]) => {
      setRentals(rentalData.items)
      setVehicles(vehicleData.items)
      setDealers(dealerData.items)
    })
  }

  useEffect(() => {
    refreshRequests()
  }, [])

  const requestRows = useMemo<RequestRow[]>(() => {
    const vehicleMap = new Map(vehicles.map(vehicle => [vehicle.id, vehicle]))
    return rentals.map((rental) => {
      const vehicle = rental.vehicle ?? vehicleMap.get(rental.vehicleId)
      const customerName = rental.customer?.name ?? 'Unknown customer'
      const customerEmail = rental.customer?.email ?? '—'
      const dealerName = rental.dealer?.name ?? 'Unknown dealer'
      const vehicleName = vehicle?.name ?? 'Unknown vehicle'
      const vehicleYear = vehicle?.year != null ? String(vehicle.year) : '—'
      const start = new Date(rental.startDate)
      const end = new Date(rental.endDate)
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)))
      const created = new Date(rental.createdAt)
      const hoursAgo = Math.max(0, Math.floor((Date.now() - created.getTime()) / (60 * 60 * 1000)))
      const timeAgo = hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo / 24)}d ago`
      const priority: Priority = rental.status === 'reserved' ? 'HIGH' : rental.status === 'active' ? 'MEDIUM' : 'LOW'
      const status: RequestStatus =
        rental.status === 'completed' ? 'APPROVED' : rental.status === 'active' ? 'IN PROGRESS' : 'PENDING'

      return {
        id: rental.id.slice(0, 8),
        sourceId: rental.id,
        createdAt: rental.createdAt,
        dealer: dealerName,
        customerName,
        customerEmail,
        customerInitial: customerName[0] ?? '?',
        vehicle: vehicleName,
        vehicleYear,
        rentalPeriod: `${rental.startDate} - ${rental.endDate}`,
        rentalDuration: `${days} days`,
        priority,
        status,
        timeAgo,
      }
    })
  }, [rentals, vehicles])

  const stats = useMemo(() => {
    const pending = requestRows.filter(row => row.status === 'PENDING').length
    const progress = requestRows.filter(row => row.status === 'IN PROGRESS').length
    return {
      total: requestRows.length,
      pending,
      progress,
    }
  }, [requestRows])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const statusNormalized = statusFilter.toLowerCase()
    const priorityNormalized = priorityFilter.toLowerCase()
    let rows = requestRows.filter(row => {
      const statusOk = statusNormalized === 'all' || row.status.toLowerCase() === statusNormalized
      const priorityOk = priorityNormalized === 'all' || row.priority.toLowerCase() === priorityNormalized
      const searchOk = !query || [row.id, row.sourceId, row.customerName, row.customerEmail, row.dealer, row.vehicle].some(value => String(value).toLowerCase().includes(query))
      return statusOk && priorityOk && searchOk
    })

    rows = [...rows].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      return sortOrder === 'oldest' ? ta - tb : tb - ta
    })
    return rows
  }, [requestRows, searchQuery, statusFilter, priorityFilter, sortOrder])

  return (
    <AdminLayout title="Cars" subtitle="Manage your vehicle inventory">
      <div className="carsPage">
        <section className="carsToolbarCard">
          <div className="carsToolbarRow">
            <div className="carsToolbarLeft">
              <div className="carsSearch">
                <span className="carsSearchIcon" aria-hidden="true">
                  <Search size={14} />
                </span>
                <input
                  className="carsSearchInput"
                  placeholder="Search by ID, customer, or dealer..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>

              <label className="carsSelectBtn">
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="IN PROGRESS">In Progress</option>
                  <option value="APPROVED">Approved</option>
                </select>
                <span className="carsChevron">▾</span>
              </label>
              <label className="carsSelectBtn">
                <select
                  aria-label="Filter by priority"
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                >
                  <option value="all">All Priority</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <span className="carsChevron">▾</span>
              </label>
              <label className="carsSelectBtn">
                <select
                  aria-label="Sort order"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
                <span className="carsChevron">▾</span>
              </label>
            </div>

            <div className="carsToolbarRight">
              <button
                className="carsPrimaryBtn"
                type="button"
                onClick={() => setShowAddModal(true)}
              >
                <Truck size={16} />
                Add Car for Dealer
              </button>
              <button
                className="carsGhostBtn"
                type="button"
                onClick={() => {
                  downloadCsv(
                    'car-requests.csv',
                    filteredRows.map(row => ({
                      id: row.id,
                      dealer: row.dealer,
                      customer: row.customerName,
                      vehicle: row.vehicle,
                      status: row.status,
                    }))
                  )
                }}
              >
                <Download size={16} />
                Export
              </button>
              <button
                className="carsIconBtn"
                type="button"
                aria-label="More"
                onClick={() => setInfoModal({ title: 'More Filters', message: 'More filter options coming soon.' })}
              >
                <Settings size={16} />
              </button>
            </div>
          </div>
        </section>

        <section className="carsStatsRow">
          <div className="carsStatCard">
            <div className="carsStatLeft">
              <div className="carsStatLabel">Total Requests</div>
              <div className="carsStatValue">{stats.total}</div>
            </div>
            <div className="carsStatIcon carsStatIcon--blue" aria-hidden="true">
              <Users size={18} />
            </div>
          </div>
          <div className="carsStatCard">
            <div className="carsStatLeft">
              <div className="carsStatLabel">Pending</div>
              <div className="carsStatValue carsStatValue--orange">{stats.pending}</div>
            </div>
            <div className="carsStatIcon carsStatIcon--amber" aria-hidden="true">
              <Timer size={18} />
            </div>
          </div>
          <div className="carsStatCard">
            <div className="carsStatLeft">
              <div className="carsStatLabel">In Progress</div>
              <div className="carsStatValue carsStatValue--blue">{stats.progress}</div>
            </div>
            <div className="carsStatIcon carsStatIcon--blue" aria-hidden="true">
              <Filter size={18} />
            </div>
          </div>
        </section>

        <section className="carsTableCard">
          <div className="carsTableTitle">Request Queue ({filteredRows.length})</div>

          <div className="carsTableWrap">
            <table className="carsTable">
              <thead>
                <tr>
                  <th className="carsColCheck">
                    <input type="checkbox" aria-label="Select all" />
                  </th>
                  <th>Request ID</th>
                  <th>Customer</th>
                  <th>Vehicle</th>
                  <th>Rental Period</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.id}>
                    <td className="carsColCheck">
                      <input type="checkbox" aria-label={`Select ${r.id}`} />
                    </td>
                    <td>
                      <div className="carsReqId">{r.id}</div>
                      <div className="carsReqDealer">{r.dealer}</div>
                    </td>
                    <td>
                      <div className="carsCustomerCell">
                        <span className="carsAvatar" aria-hidden="true">
                          {r.customerInitial}
                        </span>
                        <span>
                          <div className="carsCustomerName">{r.customerName}</div>
                          <div className="carsCustomerEmail">{r.customerEmail}</div>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="carsVehicleName">{r.vehicle}</div>
                      <div className="carsVehicleMeta">{r.vehicleYear}</div>
                    </td>
                    <td>
                      <div className="carsPeriod">{r.rentalPeriod}</div>
                      <div className="carsPeriodMeta">{r.rentalDuration}</div>
                    </td>
                    <td>
                      <span className={priorityClass(r.priority)}>{r.priority}</span>
                    </td>
                    <td>
                      <span className={statusClass(r.status)}>{r.status}</span>
                    </td>
                    <td className="carsTime">{r.timeAgo}</td>
                    <td>
                      <div className="carsActions">
                        <button
                          className="carsActionBtn"
                          type="button"
                          aria-label="View"
                          onClick={() =>
                            setInfoModal({
                              title: `Request ${r.id}`,
                              message: `Dealer: ${r.dealer}\nVehicle: ${r.vehicle}`,
                            })
                          }
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="carsActionBtn"
                          type="button"
                          aria-label="Approve"
                          onClick={() => {
                            updateRentalStatus(r.sourceId, 'completed').then(() => refreshRequests())
                          }}
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="carsTableCard carsTableCard--vehicles">
          <div className="carsTableTitle">Vehicle Inventory ({vehicles.length})</div>
          <div className="carsTableWrap">
            <table className="carsTable">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Category</th>
                  <th>Year</th>
                  <th>Daily Rate</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div className="carsVehicleCell">
                        {v.imageUrl ? (
                          <img src={v.imageUrl} alt="" className="carsVehicleThumb" />
                        ) : (
                          <div className="carsVehicleThumbPlaceholder">
                            <Truck size={20} />
                          </div>
                        )}
                        <div>
                          <div className="carsVehicleName">{v.name}</div>
                          <div className="carsVehicleMeta">{v.make} {v.model}</div>
                        </div>
                      </div>
                    </td>
                    <td>{v.category}</td>
                    <td>{v.year}</td>
                    <td>QAR {v.pricePerDay?.toLocaleString() ?? 0}</td>
                    <td>
                      <span className={`carsVehicleStatus carsVehicleStatus--${v.status}`}>{v.status}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="carsActionBtn carsActionBtn--danger"
                        onClick={() => {
                          if (window.confirm(`Delete ${v.name}?`)) {
                            deleteVehicle(v.id).then(() => refreshRequests()).catch((err) =>
                              setInfoModal({ title: 'Error', message: err instanceof Error ? err.message : 'Delete failed' })
                            )
                          }
                        }}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {vehicles.length === 0 && (
            <div className="carsEmpty">No vehicles yet. Add a car above.</div>
          )}
        </section>
      </div>
      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
      <AddCarModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        dealers={dealers}
        onSubmit={(data) => {
          createVehicle(data)
            .then(() => {
              setShowAddModal(false)
              refreshRequests()
              setInfoModal({ title: 'Add Car', message: 'Vehicle added successfully.' })
            })
            .catch((err) => {
              setInfoModal({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to add vehicle.' })
            })
        }}
      />
    </AdminLayout>
  )
}

