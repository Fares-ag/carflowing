import { useEffect, useMemo, useState } from 'react'
import type { Rental, Vehicle } from '@carflow/shared'
import { listRentals, listVehicles, updateRentalStatus } from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import { AddCarModal } from '../components/AddCarModal'
import { InfoModal } from '../components/InfoModal'
import { CalendarCheck, Check, Download, Eye, Filter, Search, Settings, Timer, Truck, Users } from 'lucide-react'
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
  const [rentals, setRentals] = useState<Rental[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [showAddModal, setShowAddModal] = useState(false)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)

  const refreshRequests = () => {
    Promise.all([listRentals({ pageSize: 8 }), listVehicles({ pageSize: 8 })]).then(
      ([rentalData, vehicleData]) => {
        setRentals(rentalData.items)
        setVehicles(vehicleData.items)
      }
    )
  }

  useEffect(() => {
    refreshRequests()
  }, [])

  const requestRows = useMemo<RequestRow[]>(() => {
    const vehicleMap = new Map(vehicles.map(vehicle => [vehicle.id, vehicle]))
    return rentals.map((rental, index) => {
      const vehicle = vehicleMap.get(rental.vehicleId)
      const name = `Customer ${index + 1}`
      const priority: Priority = index % 3 === 0 ? 'HIGH' : index % 2 === 0 ? 'MEDIUM' : 'LOW'
      const status: RequestStatus =
        rental.status === 'completed' ? 'APPROVED' : rental.status === 'active' ? 'IN PROGRESS' : 'PENDING'

      return {
        id: `REQ-${2800 + index}`,
        sourceId: rental.id,
        dealer: `Dealer ${index + 1}`,
        customerName: name,
        customerEmail: `customer${index + 1}@example.com`,
        customerInitial: name[0],
        vehicle: vehicle ? vehicle.name : 'Vehicle',
        vehicleYear: vehicle ? String(vehicle.year) : '2024',
        rentalPeriod: `${rental.startDate} - ${rental.endDate}`,
        rentalDuration: `${Math.max(1, index + 1)} days`,
        priority,
        status,
        timeAgo: `${index + 1}h ago`,
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
      const searchOk = !query || [row.id, row.customerName, row.dealer].some(value => value.toLowerCase().includes(query))
      return statusOk && priorityOk && searchOk
    })

    rows = [...rows].sort((a, b) => {
      if (sortOrder === 'oldest') return a.id.localeCompare(b.id)
      return b.id.localeCompare(a.id)
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
          <div className="carsStatCard">
            <div className="carsStatLeft">
              <div className="carsStatLabel">Avg Response</div>
              <div className="carsStatValue carsStatValue--green">2.4h</div>
            </div>
            <div className="carsStatIcon carsStatIcon--green" aria-hidden="true">
              <CalendarCheck size={18} />
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
        onSubmit={() => {
          setShowAddModal(false)
          setInfoModal({
            title: 'Add Car',
            message: 'Vehicle request sent to the selected dealer.',
          })
        }}
      />
    </AdminLayout>
  )
}

