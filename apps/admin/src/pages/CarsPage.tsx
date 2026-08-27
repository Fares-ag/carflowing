import type { Dealer, RentalStatus, Vehicle, VehicleCategory, VehicleStatus } from '@carflow/shared'
import { Check, Download, Eye, Filter, Search, Timer, Trash2, Truck, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AddCarModal } from '../components/AddCarModal'
import { InfoModal } from '../components/InfoModal'
import { AdminLayout } from '../layout/AdminLayout'
import { createVehicle, deleteVehicle, listDealers, listRentalsWithDetails, searchVehicles, updateRentalStatus, updateVehicleStatus } from '../services/adminService'
import type { RentalWithDetails } from '../services/adminService'
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
  rawStatus: RentalStatus
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
  const [deleteVehicleId, setDeleteVehicleId] = useState<string | null>(null)
  const [deleteVehicleName, setDeleteVehicleName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [vehicleQuery, setVehicleQuery] = useState('')
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus | 'all'>('all')
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory | 'all'>('all')
  const [vehicleDealerId, setVehicleDealerId] = useState('all')
  const [vehicleMinPrice, setVehicleMinPrice] = useState('')
  const [vehicleMaxPrice, setVehicleMaxPrice] = useState('')
  const [vehicleTotal, setVehicleTotal] = useState(0)

  const refreshRequests = () => {
    setIsLoading(true)
    setLoadError(null)
    Promise.all([
      listRentalsWithDetails({ pageSize: 50 }),
      searchVehicles({
        pageSize: 100,
        q: vehicleQuery.trim() || undefined,
        status: vehicleStatus === 'all' ? undefined : vehicleStatus,
        category: vehicleCategory === 'all' ? undefined : vehicleCategory,
        dealerId: vehicleDealerId === 'all' ? undefined : vehicleDealerId,
        minPrice: vehicleMinPrice ? Number(vehicleMinPrice) : undefined,
        maxPrice: vehicleMaxPrice ? Number(vehicleMaxPrice) : undefined,
      }),
      listDealers({ pageSize: 100 }),
    ])
      .then(([rentalData, vehicleData, dealerData]) => {
        setRentals(rentalData.items)
        setVehicles(vehicleData.items)
        setVehicleTotal(vehicleData.total)
        setDealers(dealerData.items)
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load cars data')
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    refreshRequests()
  }, [vehicleQuery, vehicleStatus, vehicleCategory, vehicleDealerId, vehicleMinPrice, vehicleMaxPrice])

  const requestRows = useMemo<RequestRow[]>(() => {
    const vehicleMap = new Map(vehicles.map(vehicle => [vehicle.id, vehicle]))
    return rentals.map((rental) => {
      const vehicle = rental.vehicle ?? vehicleMap.get(rental.vehicleId)
      const customerName = rental.customer?.name?.trim() || rental.customer?.email?.trim() || '—'
      const customerEmail = rental.customer?.email?.trim() || '—'
      const dealerName = rental.dealer?.name?.trim() || '—'
      const vehicleName = vehicle?.name?.trim() || '—'
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
        rawStatus: rental.status,
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
        {loadError && (
          <div className="carsErrorBanner" role="alert">
            <span>{loadError}</span>
            <button type="button" className="carsActionBtn" onClick={() => refreshRequests()}>
              Retry
            </button>
          </div>
        )}
        {isLoading ? (
          <div className="carsEmpty" role="status">
            Loading cars data…
          </div>
        ) : (
          <>
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
                        {r.rawStatus === 'reserved' && (
                          <button
                            className="carsActionBtn"
                            type="button"
                            aria-label="Approve"
                            onClick={() => {
                              updateRentalStatus(r.sourceId, 'active')
                                .then(() => refreshRequests())
                                .catch((err) =>
                                  setInfoModal({
                                    title: 'Error',
                                    message:
                                      err instanceof Error ? err.message : 'Failed to approve rental',
                                  })
                                )
                            }}
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="carsTableCard carsTableCard--vehicles">
          <div className="carsTableTitle">Vehicle Inventory ({vehicleTotal})</div>
          <div className="carsVehicleFilters">
            <div className="carsSearch">
              <span className="carsSearchIcon" aria-hidden="true">
                <Search size={14} />
              </span>
              <input
                className="carsSearchInput"
                placeholder="Search make, model, plate…"
                value={vehicleQuery}
                onChange={(event) => setVehicleQuery(event.target.value)}
              />
            </div>
            <label className="carsSelectBtn">
              <select
                aria-label="Filter vehicles by status"
                value={vehicleStatus}
                onChange={(event) => setVehicleStatus(event.target.value as VehicleStatus | 'all')}
              >
                <option value="all">All statuses</option>
                <option value="available">Available</option>
                <option value="rented">Rented</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="carsSelectBtn">
              <select
                aria-label="Filter vehicles by category"
                value={vehicleCategory}
                onChange={(event) => setVehicleCategory(event.target.value as VehicleCategory | 'all')}
              >
                <option value="all">All categories</option>
                <option value="sedan">Sedan</option>
                <option value="suv">SUV</option>
                <option value="truck">Truck</option>
                <option value="luxury">Luxury</option>
                <option value="ev">EV</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="carsSelectBtn">
              <select
                aria-label="Filter vehicles by dealer"
                value={vehicleDealerId}
                onChange={(event) => setVehicleDealerId(event.target.value)}
              >
                <option value="all">All dealers</option>
                {dealers.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>
                    {dealer.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="carsPriceInput"
              type="number"
              min="0"
              placeholder="Min price"
              value={vehicleMinPrice}
              onChange={(event) => setVehicleMinPrice(event.target.value)}
            />
            <input
              className="carsPriceInput"
              type="number"
              min="0"
              placeholder="Max price"
              value={vehicleMaxPrice}
              onChange={(event) => setVehicleMaxPrice(event.target.value)}
            />
          </div>
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
                      <label className="carsSelectBtn">
                        <select
                          aria-label={`Status for ${v.name}`}
                          value={v.status}
                          onChange={(event) => {
                            const nextStatus = event.target.value as VehicleStatus
                            updateVehicleStatus(v.id, nextStatus)
                              .then(() => refreshRequests())
                              .catch((err) =>
                                setInfoModal({
                                  title: 'Error',
                                  message: err instanceof Error ? err.message : 'Failed to update vehicle status',
                                })
                              )
                          }}
                        >
                          <option value="available">available</option>
                          <option value="rented">rented</option>
                          <option value="maintenance">maintenance</option>
                          <option value="inactive">inactive</option>
                        </select>
                      </label>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="carsActionBtn carsActionBtn--danger"
                        onClick={() => {
                          setDeleteVehicleId(v.id)
                          setDeleteVehicleName(v.name)
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
          </>
        )}
      </div>
      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
      <InfoModal
        open={!!deleteVehicleId}
        title="Delete vehicle?"
        message={`Delete ${deleteVehicleName}? This cannot be undone.`}
        onClose={() => setDeleteVehicleId(null)}
        onConfirm={() => {
          if (!deleteVehicleId) return
          deleteVehicle(deleteVehicleId)
            .then(() => {
              setDeleteVehicleId(null)
              refreshRequests()
            })
            .catch((err) => {
              // Surface server errors verbatim (e.g. 409 "has rental history — set inactive instead").
              const message = err instanceof Error ? err.message : 'Delete failed'
              toast.error(message)
              setDeleteVehicleId(null)
              setInfoModal({ title: 'Could not delete vehicle', message })
            })
        }}
        confirmLabel="Delete"
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

