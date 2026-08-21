import type { VehicleCategory } from '@carflow/shared'
import { formatCurrency } from '@carflow/shared'
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
  Timer,
  Wrench,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import { AddVehicleModal } from '../components/modals/AddVehicleModal'
import { EditVehicleModal, type EditVehicleValues } from '../components/modals/EditVehicleModal'
import { VehicleDetailsModal } from '../components/modals/VehicleDetailsModal'
import { createVehicle, listInventory, updateVehicle, updateVehicleStatus } from '../services/dealerService'
import './Inventory.css'

type VehicleStatus = 'Available' | 'Rented' | 'Maintenance'

interface InventoryVehicleRow {
  id: string
  name: string
  make: string
  model: string
  category: VehicleCategory
  year: number
  status: VehicleStatus
  dailyRateQar: number
  mileage: number
  fuelType: 'gas' | 'diesel' | 'electric' | 'hybrid'
  transmission: 'automatic' | 'manual'
  seats: number
  imageUrl?: string
  imageUrls?: string[]
  description?: string
  color?: string
  mileageCapKm?: number
  features?: string[]
}

function formatCategoryLabel(category: VehicleCategory): string {
  if (category === 'suv') return 'SUV'
  if (category === 'ev') return 'EV'
  return category.charAt(0).toUpperCase() + category.slice(1)
}

export const Inventory = memo(function Inventory() {
  const navigate = useNavigate()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [vehicles, setVehicles] = useState<InventoryVehicleRow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshInventory = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true)
    setLoadError(null)
    return listInventory({ pageSize: 100 })
      .then((data) => {
        const mapped = data.items.map((vehicle) => ({
          id: vehicle.id,
          name: vehicle.name,
          make: vehicle.make ?? '',
          model: vehicle.model ?? '',
          category: vehicle.category,
          year: vehicle.year,
          status:
            vehicle.status === 'available'
              ? ('Available' as const)
              : vehicle.status === 'rented'
                ? ('Rented' as const)
                : ('Maintenance' as const),
          dailyRateQar: vehicle.pricePerDay,
          mileage: vehicle.mileage ?? 0,
          fuelType: vehicle.fuelType ?? 'gas',
          transmission: vehicle.transmission ?? 'automatic',
          seats: vehicle.seats ?? 5,
          imageUrl: vehicle.imageUrl,
          imageUrls: vehicle.imageUrls,
          description: vehicle.description,
          color: vehicle.color,
          mileageCapKm: vehicle.mileageCapKm,
          features: vehicle.features,
        }))
        setVehicles(mapped)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load inventory'
        setLoadError(message)
        toast.error(message)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void refreshInventory(true)
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
      const searchOk =
        !query ||
        [vehicle.name, vehicle.make, vehicle.model, vehicle.id].some((value) =>
          String(value).toLowerCase().includes(query)
        )
      return statusOk && categoryOk && searchOk
    })

    list = [...list].sort((a, b) => {
      if (sortBy === 'rate') return b.dailyRateQar - a.dailyRateQar
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
      vehicleName: v?.name ?? '',
      make: v?.make ?? '',
      model: v?.model ?? '',
      fuelType: v?.fuelType ?? 'gas',
      category: v?.category ?? 'sedan',
      transmission: v?.transmission ?? 'automatic',
      dailyRate: String(v?.dailyRateQar ?? 0),
      seatingCapacity: String(v?.seats ?? 5),
      year: String(v?.year ?? new Date().getFullYear()),
      mileage: String(v?.mileage ?? 0),
      status: (v?.status ?? 'Available') as EditVehicleValues['status'],
      imageUrl: v?.imageUrl,
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
                const rows = filteredVehicles.map((vehicle) => ({
                  id: vehicle.id,
                  name: vehicle.name,
                  category: formatCategoryLabel(vehicle.category),
                  status: vehicle.status,
                  rate: formatCurrency(vehicle.dailyRateQar),
                }))
                type CsvRow = (typeof rows)[number]
                const headers: (keyof CsvRow)[] = ['id', 'name', 'category', 'status', 'rate']
                const csv = [
                  headers.join(','),
                  ...rows.map((row) =>
                    headers.map((header) => `"${String(row[header] ?? '')}"`).join(',')
                  ),
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
              <div className="inv-statMeta"></div>
            </div>
            <div className="inv-statIcon inv-statIcon--blue" aria-hidden="true">
              <Car size={18} />
            </div>
          </div>
          <div className="inv-statCard">
            <div className="inv-statText">
              <div className="inv-statLabel">Available</div>
              <div className="inv-statValue">{stats.available}</div>
              <div className="inv-statMeta"></div>
            </div>
            <div className="inv-statIcon inv-statIcon--green" aria-hidden="true">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="inv-statCard">
            <div className="inv-statText">
              <div className="inv-statLabel">Currently Rented</div>
              <div className="inv-statValue">{stats.rented}</div>
              <div className="inv-statMeta"></div>
            </div>
            <div className="inv-statIcon inv-statIcon--purple" aria-hidden="true">
              <Timer size={18} />
            </div>
          </div>
          <div className="inv-statCard">
            <div className="inv-statText">
              <div className="inv-statLabel">Under Maintenance</div>
              <div className="inv-statValue">{stats.maintenance}</div>
              <div className="inv-statMeta"></div>
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
                placeholder="Search vehicles by name, make, model, or ID..."
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
              </label>
              <label className="inv-selectBtn">
                <select
                  aria-label="Filter by category"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">All Categories</option>
                  <option value="sedan">Sedan</option>
                  <option value="suv">SUV</option>
                  <option value="truck">Truck</option>
                  <option value="luxury">Luxury</option>
                  <option value="ev">EV</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="inv-selectBtn">
                <select
                  aria-label="Sort vehicles"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  <option value="name">Name</option>
                  <option value="rate">Daily Rate</option>
                </select>
              </label>

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

        {loading ? <p className="inventory-subtitle">Loading inventory…</p> : null}
        {loadError && !loading ? (
          <p className="inventory-subtitle" role="alert">
            {loadError}{' '}
            <button type="button" className="inv-btn inv-btn--ghost" onClick={() => void refreshInventory(true)}>
              Retry
            </button>
          </p>
        ) : null}
        {!loading && !loadError && vehicles.length === 0 ? (
          <p className="inventory-subtitle">No vehicles yet. Add your first vehicle to get started.</p>
        ) : null}

        {!loading && !loadError ? (
          view === 'grid' ? (
          <div className="inv-grid">
            {filteredVehicles.map(vehicle => (
              <article key={vehicle.id} className="inv-vehicleCard">
                <div className={`inv-vehicleImage inv-vehicleImage--${vehicle.id}`}>
                  {vehicle.imageUrl ? (
                    <img src={vehicle.imageUrl} alt={vehicle.name} className="inv-vehicleImageImg" />
                  ) : null}
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
                      {formatCategoryLabel(vehicle.category)} <span className="inv-dot">•</span> {vehicle.year}{' '}
                      <span className="inv-dot">•</span> {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—'}
                    </div>
                  </div>

                  <div className="inv-metrics">
                    <div className="inv-metric">
                      <div className="inv-metricLabel">
                        Daily Rate <span className="inv-metricHint"><Info size={12} /></span>
                      </div>
                      <div className="inv-metricValue">{formatCurrency(vehicle.dailyRateQar)}</div>
                    </div>
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
                  {vehicle.imageUrl ? (
                    <img src={vehicle.imageUrl} alt={vehicle.name} className="inv-thumb inv-thumbImg" />
                  ) : (
                    <div className={`inv-thumb inv-thumb--${vehicle.id}`} />
                  )}
                </div>

                <div className="inv-listMain">
                  <div className="inv-listTop">
                    <div>
                      <div className="inv-vehicleName">{vehicle.name}</div>
                      <div className="inv-vehicleMeta">
                        {formatCategoryLabel(vehicle.category)} <span className="inv-dot">•</span> {vehicle.year}{' '}
                        <span className="inv-dot">•</span> {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—'}
                      </div>
                    </div>
                    <div className={`inv-statusBadge inv-statusBadge--${vehicle.status.toLowerCase()}`}>
                      {vehicle.status}
                    </div>
                  </div>

                  <div className="inv-listMetrics">
                    <div className="inv-listMetric">
                      <div className="inv-listMetricLabel">Daily Rate</div>
                      <div className="inv-listMetricValue">{formatCurrency(vehicle.dailyRateQar)}</div>
                    </div>
                  </div>

                  <div className="inv-listBottom">
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
        )
        ) : null}
      </div>

      <AddVehicleModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreate={async (values) => {
          try {
            await createVehicle({
              name: values.name,
              make: values.make,
              model: values.model,
              year: values.year,
              category: values.category,
              status:
                values.status === 'Available'
                  ? 'available'
                  : values.status === 'Rented'
                    ? 'rented'
                    : 'maintenance',
              pricePerDay: values.dailyRateQar,
              mileage: values.mileage ?? 0,
              transmission: values.transmission ?? 'automatic',
              fuelType: values.fuelType ?? 'gas',
              seats: values.seats ?? 5,
              imageUrl: values.imageUrl,
              imageUrls: values.imageUrls,
              description: values.description,
              color: values.color,
              locationCity: values.locationCity,
              locationArea: values.locationArea,
              mileageCapKm: values.mileageCapKm,
              features: values.features,
            })
            await refreshInventory()
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to add vehicle'
            toast.error(message)
            throw err instanceof Error ? err : new Error(message)
          }
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
          onDuplicateVehicle={(v) => {
            createVehicle({
              name: `${v.name} (copy)`,
              make: v.make,
              model: v.model,
              year: v.year,
              category: v.category,
              status: 'available',
              pricePerDay: v.dailyRateQar,
              mileage: v.mileage,
              transmission: v.transmission,
              fuelType: v.fuelType,
              seats: v.seats,
              imageUrl: v.imageUrl,
            }).then(() => {
              refreshInventory()
              setViewingId(null)
            }).catch((err) => {
              toast.error(err instanceof Error ? err.message : 'Failed to duplicate vehicle')
            })
          }}
        />
      )}
      <EditVehicleModal
        isOpen={!!editingId}
        initialValues={editInitialValues}
        onClose={() => setEditingId(null)}
        onSave={(values) => {
          if (!editingId) return
          // The general PATCH rejects `status` (400) — status changes go through the /status endpoint.
          const nextStatus =
            values.status === 'Available'
              ? ('available' as const)
              : values.status === 'Rented'
                ? ('rented' as const)
                : ('maintenance' as const)
          const statusChanged = editingVehicle ? editingVehicle.status !== values.status : false
          updateVehicle(editingId, {
            name: values.vehicleName,
            make: values.make,
            model: values.model,
            category: values.category,
            year: Number(values.year) || new Date().getFullYear(),
            pricePerDay: Number(values.dailyRate) || 0,
            mileage: Number(String(values.mileage).replace(/\D/g, '')) || 0,
            transmission: values.transmission,
            fuelType: values.fuelType,
            seats: Number(values.seatingCapacity) || 5,
            imageUrl: values.imageUrl,
          })
            .then(() => (statusChanged ? updateVehicleStatus(editingId, nextStatus) : null))
            .then(() => refreshInventory())
            .catch((err) => {
              // 409 (open rental) and 400 errors carry the server explanation in the message.
              toast.error(err instanceof Error ? err.message : 'Failed to update vehicle')
              void refreshInventory()
            })
        }}
      />
    </div>
  )
})

