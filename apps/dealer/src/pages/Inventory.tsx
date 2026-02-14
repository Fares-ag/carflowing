import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createVehicle, listInventory, updateVehicle } from '../services/dealerService'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
import { AddVehicleModal } from '../components/modals/AddVehicleModal'
import { EditVehicleModal, type EditVehicleValues } from '../components/modals/EditVehicleModal'
import { VehicleDetailsModal } from '../components/modals/VehicleDetailsModal'
import {
  BarChart3,
  Car,
  CheckCircle2,
  Download,
  Eye,
  Grid,
  Info,
  List,
  MoreHorizontal,
  Pencil,
  Search,
  SlidersHorizontal,
  Star,
  Timer,
  Wrench,
} from 'lucide-react'
import './Inventory.css'

type VehicleStatus = 'Available' | 'Rented' | 'Maintenance'
type VehicleCategory = 'Sedan' | 'SUV'

interface Vehicle {
  id: string
  name: string
  category: VehicleCategory
  year: number
  licensePlate: string
  status: VehicleStatus
  dailyRateQar: number
  totalBookings: number
  totalRevenueQar: number
  rating: number
  tags: string[]
}

function formatQar(value: number) {
  return `QAR ${value.toLocaleString()}`
}

export const Inventory = memo(function Inventory() {
  const navigate = useNavigate()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')

  const refreshInventory = useCallback(() => {
    listInventory({ pageSize: 12 }).then((data) => {
      const mapped = data.items.map((vehicle, index) => ({
        id: vehicle.id,
        name: vehicle.name,
        category: vehicle.category === 'suv' ? 'SUV' : 'Sedan',
        year: vehicle.year,
        licensePlate: String(100000 + index),
        status: vehicle.status === 'available' ? 'Available' : vehicle.status === 'rented' ? 'Rented' : 'Maintenance',
        dailyRateQar: vehicle.pricePerDay,
        totalBookings: 6 + index * 3,
        totalRevenueQar: vehicle.pricePerDay * (6 + index * 2),
        rating: 4.6 + index * 0.1,
        tags: ['Premium Interior', 'Navigation', 'GPS', '+2 more'],
      }))
      setVehicles(mapped)
    })
  }, [])

  useEffect(() => {
    refreshInventory()
  }, [refreshInventory])

  const stats = useMemo(() => {
    const total = vehicles.length
    const available = vehicles.filter(v => v.status === 'Available').length
    const rented = vehicles.filter(v => v.status === 'Rented').length
    const maintenance = vehicles.filter(v => v.status === 'Maintenance').length
    return { total, available, rented, maintenance }
  }, [vehicles])

  const filteredVehicles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const statusNormalized = statusFilter.toLowerCase()
    const categoryNormalized = categoryFilter.toLowerCase()
    let list = vehicles.filter(vehicle => {
      const statusOk = statusNormalized === 'all' || vehicle.status.toLowerCase() === statusNormalized
      const categoryOk = categoryNormalized === 'all' || vehicle.category.toLowerCase() === categoryNormalized
      const searchOk = !query || [vehicle.name, vehicle.licensePlate].some(value => value.toLowerCase().includes(query))
      return statusOk && categoryOk && searchOk
    })

    list = [...list].sort((a, b) => {
      if (sortBy === 'rate') return b.dailyRateQar - a.dailyRateQar
      if (sortBy === 'rating') return b.rating - a.rating
      return a.name.localeCompare(b.name)
    })

    return list
  }, [vehicles, searchQuery, statusFilter, categoryFilter, sortBy])

  const editingVehicle = useMemo(() => {
    if (!editingId) return null
    return vehicles.find(v => v.id === editingId) ?? null
  }, [editingId, vehicles])

  const viewingVehicle = useMemo(() => {
    if (!viewingId) return null
    return vehicles.find(v => v.id === viewingId) ?? null
  }, [viewingId, vehicles])

  const editInitialValues: EditVehicleValues = useMemo(() => {
    const v = editingVehicle
    return {
      vehicleName: v?.name ?? 'BMW X3 2024',
      fuelType: 'Petrol',
      category: v?.category === 'SUV' ? 'SUV' : 'Sedan',
      transmission: 'Automatic',
      dailyRate: String(v?.dailyRateQar ?? 300),
      seatingCapacity: '5 Seats',
      year: String(v?.year ?? 2024),
      color: 'Midnight Black',
      status: (v?.status ?? 'Available') as any,
      licensePlate: v?.licensePlate ?? '123456',
      description: 'Luxury SUV with premium features and excellent performance.',
    }
  }, [editingVehicle])

  return (
    <div className="inventory-page">
      <Sidebar />
      <Header />

      <div className="inventory-content">
        <div className="inventory-header">
          <div className="inventory-titleBlock">
            <h1 className="inventory-title">Vehicle Inventory</h1>
            <p className="inventory-subtitle">Manage your fleet, track performance, and optimize</p>
          </div>

          <div className="inventory-actions">
            <button
              className="inv-btn inv-btn--ghost"
              type="button"
              onClick={() => {
                const rows = filteredVehicles.map(vehicle => ({
                  id: vehicle.id,
                  name: vehicle.name,
                  category: vehicle.category,
                  status: vehicle.status,
                  rate: formatQar(vehicle.dailyRateQar),
                }))
                const headers = Object.keys(rows[0] ?? {})
                const csv = [
                  headers.join(','),
                  ...rows.map(row => headers.map(header => `"${row[header] ?? ''}"`).join(',')),
                ].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const link = document.createElement('a')
                link.href = URL.createObjectURL(blob)
                link.setAttribute('download', 'dealer-inventory.csv')
                document.body.appendChild(link)
                link.click()
                link.remove()
              }}
            >
              <span className="inv-btn__icon" aria-hidden="true">
                <Download size={16} />
              </span>
              Export Data
            </button>
            <button
              className="inv-btn inv-btn--ghost"
              type="button"
              onClick={() => navigate('/analytics')}
            >
              <span className="inv-btn__icon" aria-hidden="true">
                <BarChart3 size={16} />
              </span>
              Analytics
            </button>
            <button className="inv-btn inv-btn--primary" type="button" onClick={() => setIsAddOpen(true)}>
              <span className="inv-btn__icon" aria-hidden="true">
                <Car size={16} />
              </span>
              Add Vehicle
            </button>
          </div>
        </div>

        <div className="inv-stats">
          <div className="inv-statCard">
            <div className="inv-statText">
              <div className="inv-statLabel">Total Vehicles</div>
              <div className="inv-statValue">{stats.total}</div>
              <div className="inv-statMeta">+2 this month</div>
            </div>
            <div className="inv-statIcon inv-statIcon--blue" aria-hidden="true">
              <Car size={18} />
            </div>
          </div>
          <div className="inv-statCard">
            <div className="inv-statText">
              <div className="inv-statLabel">Available</div>
              <div className="inv-statValue">{stats.available}</div>
              <div className="inv-statMeta">67% utilization</div>
            </div>
            <div className="inv-statIcon inv-statIcon--green" aria-hidden="true">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="inv-statCard">
            <div className="inv-statText">
              <div className="inv-statLabel">Currently Rented</div>
              <div className="inv-statValue">{stats.rented}</div>
              <div className="inv-statMeta">+15% vs last month</div>
            </div>
            <div className="inv-statIcon inv-statIcon--purple" aria-hidden="true">
              <Timer size={18} />
            </div>
          </div>
          <div className="inv-statCard">
            <div className="inv-statText">
              <div className="inv-statLabel">Under Maintenance</div>
              <div className="inv-statValue">{stats.maintenance}</div>
              <div className="inv-statMeta">Avg 2.3 days</div>
            </div>
            <div className="inv-statIcon inv-statIcon--red" aria-hidden="true">
              <Wrench size={18} />
            </div>
          </div>
        </div>

        <div className="inv-filtersCard">
          <div className="inv-filtersRow">
            <div className="inv-search">
              <span className="inv-searchIcon" aria-hidden="true">
                <Search size={14} />
              </span>
              <input
                className="inv-searchInput"
                placeholder="Search vehicles by name, license plate..."
                aria-label="Search vehicles"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            <div className="inv-filterControls">
              <label className="inv-selectBtn">
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="Available">Available</option>
                  <option value="Rented">Rented</option>
                  <option value="Maintenance">Maintenance</option>
                </select>
                <span className="inv-selectChevron">▾</span>
              </label>
              <label className="inv-selectBtn">
                <select
                  aria-label="Filter by category"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">All Categories</option>
                  <option value="Sedan">Sedan</option>
                  <option value="SUV">SUV</option>
                </select>
                <span className="inv-selectChevron">▾</span>
              </label>
              <label className="inv-selectBtn">
                <select
                  aria-label="Sort vehicles"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  <option value="name">Name</option>
                  <option value="rate">Daily Rate</option>
                  <option value="rating">Rating</option>
                </select>
                <span className="inv-selectChevron">▾</span>
              </label>

              <button className="inv-iconBtn" type="button" aria-label="More filters">
                <SlidersHorizontal size={14} />
              </button>

              <div className="inv-viewToggle" role="group" aria-label="View toggle">
                <button
                  className={`inv-toggleBtn ${view === 'grid' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setView('grid')}
                  aria-pressed={view === 'grid'}
                  aria-label="Grid view"
                >
                  <Grid size={14} />
                </button>
                <button
                  className={`inv-toggleBtn ${view === 'list' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setView('list')}
                  aria-pressed={view === 'list'}
                  aria-label="List view"
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="inv-resultsRow">Showing {filteredVehicles.length} of {vehicles.length} vehicles</div>
        </div>

        {view === 'grid' ? (
          <div className="inv-grid">
            {filteredVehicles.map(vehicle => (
              <article key={vehicle.id} className="inv-vehicleCard">
                <div className={`inv-vehicleImage inv-vehicleImage--${vehicle.id}`}>
                  <div className="inv-vehicleImageOverlay" />
                  <div className={`inv-statusBadge inv-statusBadge--${vehicle.status.toLowerCase()}`}>
                    {vehicle.status}
                  </div>
                  <div className="inv-imageActions">
                    <button className="inv-imgBtn" type="button" onClick={() => setViewingId(vehicle.id)}>
                      <Eye size={14} />
                      View
                    </button>
                    <button className="inv-imgBtn" type="button" onClick={() => setEditingId(vehicle.id)}>
                      <Pencil size={14} />
                      Edit
                    </button>
                  </div>
                </div>

                <div className="inv-vehicleBody">
                  <div className="inv-vehicleTop">
                    <div className="inv-vehicleName">{vehicle.name}</div>
                    <div className="inv-vehicleMeta">
                      {vehicle.category} <span className="inv-dot">•</span> {vehicle.year}{' '}
                      <span className="inv-dot">•</span> {vehicle.licensePlate}
                    </div>
                  </div>

                  <div className="inv-metrics">
                    <div className="inv-metric">
                      <div className="inv-metricLabel">
                        Daily Rate <span className="inv-metricHint"><Info size={12} /></span>
                      </div>
                      <div className="inv-metricValue">{formatQar(vehicle.dailyRateQar)}</div>
                    </div>
                    <div className="inv-metric">
                      <div className="inv-metricLabel">
                        Total Bookings <span className="inv-metricHint"><Info size={12} /></span>
                      </div>
                      <div className="inv-metricValue">{vehicle.totalBookings}</div>
                    </div>
                    <div className="inv-metric">
                      <div className="inv-metricLabel">
                        Total Revenue <span className="inv-metricHint"><Info size={12} /></span>
                      </div>
                      <div className="inv-metricValue">{formatQar(vehicle.totalRevenueQar)}</div>
                    </div>
                    <div className="inv-metric">
                      <div className="inv-metricLabel">
                        Rating <span className="inv-metricHint"><Info size={12} /></span>
                      </div>
                      <div className="inv-metricValue">
                        <span className="inv-star" aria-hidden="true">
                          <Star size={14} />
                        </span>{' '}
                        {vehicle.rating.toFixed(1)}
                      </div>
                    </div>
                  </div>

                  <div className="inv-tags">
                    {vehicle.tags.map(tag => (
                      <span key={tag} className="inv-tag">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="inv-actionsRow">
                    <button className="inv-btn inv-btn--outline" type="button" onClick={() => setEditingId(vehicle.id)}>
                      <Pencil size={14} />
                      Edit Details
                    </button>
                    <button className="inv-btn inv-btn--outline" type="button" onClick={() => setViewingId(vehicle.id)}>
                      <Eye size={14} />
                      View Full
                    </button>
                    <button
                      className="inv-btn inv-btn--icon"
                      type="button"
                      aria-label="More actions"
                      onClick={() => setViewingId(vehicle.id)}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="inv-list">
            {filteredVehicles.map(vehicle => (
              <article key={vehicle.id} className="inv-listRow">
                <div className="inv-listMedia">
                  <div className={`inv-thumb inv-thumb--${vehicle.id}`} />
                </div>

                <div className="inv-listMain">
                  <div className="inv-listTop">
                    <div>
                      <div className="inv-vehicleName">{vehicle.name}</div>
                      <div className="inv-vehicleMeta">
                        {vehicle.category} <span className="inv-dot">•</span> {vehicle.year}{' '}
                        <span className="inv-dot">•</span> {vehicle.licensePlate}
                      </div>
                    </div>
                    <div className={`inv-statusBadge inv-statusBadge--${vehicle.status.toLowerCase()}`}>
                      {vehicle.status}
                    </div>
                  </div>

                  <div className="inv-listMetrics">
                    <div className="inv-listMetric">
                      <div className="inv-listMetricLabel">Daily Rate</div>
                      <div className="inv-listMetricValue">{formatQar(vehicle.dailyRateQar)}</div>
                    </div>
                    <div className="inv-listMetric">
                      <div className="inv-listMetricLabel">Bookings</div>
                      <div className="inv-listMetricValue">{vehicle.totalBookings}</div>
                    </div>
                    <div className="inv-listMetric">
                      <div className="inv-listMetricLabel">Revenue</div>
                      <div className="inv-listMetricValue">{formatQar(vehicle.totalRevenueQar)}</div>
                    </div>
                    <div className="inv-listMetric">
                      <div className="inv-listMetricLabel">Rating</div>
                      <div className="inv-listMetricValue">
                        <span className="inv-star" aria-hidden="true">
                        <Star size={14} />
                        </span>{' '}
                        {vehicle.rating.toFixed(1)}
                      </div>
                    </div>
                  </div>

                  <div className="inv-listBottom">
                    <div className="inv-tags inv-tags--compact">
                      {vehicle.tags.slice(0, 4).map(tag => (
                        <span key={tag} className="inv-tag inv-tag--small">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="inv-rowActions">
                      <button className="inv-btn inv-btn--outline" type="button" onClick={() => setViewingId(vehicle.id)}>
                        <Eye size={14} />
                        View
                      </button>
                      <button className="inv-btn inv-btn--outline" type="button" onClick={() => setEditingId(vehicle.id)}>
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        className="inv-btn inv-btn--icon"
                        type="button"
                        aria-label="More actions"
                        onClick={() => setViewingId(vehicle.id)}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <AddVehicleModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={(values) => {
          createVehicle({
            dealerId: 'dealer_1',
            name: values.name,
            make: values.name.split(' ')[0] ?? 'Brand',
            model: values.name.split(' ').slice(1).join(' ') || 'Model',
            year: values.year,
            category: values.category === 'SUV' ? 'suv' : 'sedan',
            status:
              values.status === 'Available'
                ? 'available'
                : values.status === 'Rented'
                ? 'rented'
                : 'maintenance',
            pricePerDay: values.dailyRateQar,
            mileage: 0,
            transmission: 'automatic',
            fuelType: 'gas',
            seats: 5,
          }).then(() => {
            refreshInventory()
          })
        }}
      />
      {viewingVehicle && (
        <VehicleDetailsModal
          isOpen={!!viewingId}
          vehicle={viewingVehicle}
          onClose={() => setViewingId(null)}
          onEditVehicle={() => {
            setViewingId(null)
            setEditingId(viewingVehicle.id)
          }}
        />
      )}
      <EditVehicleModal
        isOpen={!!editingId}
        initialValues={editInitialValues}
        onClose={() => setEditingId(null)}
        onSave={(values) => {
          if (!editingId) return
          updateVehicle(editingId, {
            name: values.vehicleName,
            category: values.category === 'SUV' ? 'suv' : 'sedan',
            year: Number(values.year) || 2024,
            pricePerDay: Number(values.dailyRate) || 300,
            status:
              values.status === 'Available'
                ? 'available'
                : values.status === 'Rented'
                ? 'rented'
                : 'maintenance',
          }).then(() => {
            refreshInventory()
          })
        }}
      />
    </div>
  )
})

