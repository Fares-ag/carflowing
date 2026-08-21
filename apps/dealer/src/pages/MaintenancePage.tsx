import type { Vehicle } from '@carflow/shared'
import { formatDate, formatDateOrDash } from '@carflow/shared'
import { Calendar, Check, Plus, Wrench } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import {
  acceptDealerMaintenance,
  completeDealerMaintenance,
  createDealerMaintenance,
  listDealerMaintenance,
  listInventory,
  scheduleDealerMaintenance,
  type DealerMaintenanceRecord,
} from '../services/dealerService'
import './MaintenancePage.css'

const PAGE_SIZE = 10

const STATUS_LABELS: Record<string, string> = {
  requested: 'Customer request',
  scheduled: 'Scheduled',
  open: 'In progress',
  completed: 'Completed',
}

export function MaintenancePage() {
  const [records, setRecords] = useState<DealerMaintenanceRecord[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles])
  const customerRequests = useMemo(
    () => records.filter((record) => record.source === 'customer' && record.status === 'requested'),
    [records]
  )

  const refresh = useCallback(() => {
    setLoading(true)
    Promise.all([
      listDealerMaintenance({ page, pageSize: PAGE_SIZE }),
      listInventory({ pageSize: 100 }),
    ])
      .then(([maintenance, inventory]) => {
        setRecords(maintenance.items)
        setTotal(maintenance.total)
        setVehicles(inventory.items)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load maintenance'))
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => {
    refresh()
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!vehicleId || !title.trim()) {
      toast.error('Vehicle and title are required')
      return
    }
    setSubmitting(true)
    try {
      await createDealerMaintenance({
        vehicleId,
        title: title.trim(),
        description: description.trim() || undefined,
      })
      toast.success('Maintenance record created')
      setShowForm(false)
      setVehicleId('')
      setTitle('')
      setDescription('')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to create maintenance record')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAccept = async (id: string) => {
    setBusyId(id)
    try {
      await acceptDealerMaintenance(id)
      toast.success('Customer request accepted')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to accept request')
    } finally {
      setBusyId(null)
    }
  }

  const handleSchedule = async (id: string) => {
    if (!scheduleDate) {
      toast.error('Choose a service date')
      return
    }
    setBusyId(id)
    try {
      await scheduleDealerMaintenance(id, scheduleDate)
      toast.success('Service scheduled')
      setScheduleId(null)
      setScheduleDate('')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to schedule service')
    } finally {
      setBusyId(null)
    }
  }

  const handleComplete = async (id: string) => {
    setBusyId(id)
    try {
      await completeDealerMaintenance(id)
      toast.success('Maintenance marked complete')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to complete maintenance')
    } finally {
      setBusyId(null)
    }
  }

  const renderActions = (record: DealerMaintenanceRecord) => {
    if (record.status === 'completed') {
      return formatDateOrDash(record.completedAt)
    }

    if (record.status === 'requested') {
      return (
        <div className="maintenance-actions">
          <button
            type="button"
            className="maintenance-action-btn maintenance-action-btn--primary"
            disabled={busyId === record.id}
            onClick={() => handleAccept(record.id)}
          >
            Accept
          </button>
          <button
            type="button"
            className="maintenance-action-btn"
            disabled={busyId === record.id}
            onClick={() => {
              setScheduleId(record.id)
              setScheduleDate('')
            }}
          >
            <Calendar size={14} />
            Schedule
          </button>
          <button
            type="button"
            className="maintenance-complete-btn"
            disabled={busyId === record.id}
            onClick={() => handleComplete(record.id)}
          >
            <Check size={14} />
            Complete
          </button>
        </div>
      )
    }

    if (record.status === 'scheduled') {
      return (
        <div className="maintenance-actions">
          <button
            type="button"
            className="maintenance-action-btn"
            disabled={busyId === record.id}
            onClick={() => {
              setScheduleId(record.id)
              setScheduleDate(record.scheduledAt?.slice(0, 10) ?? '')
            }}
          >
            <Calendar size={14} />
            Reschedule
          </button>
          <button
            type="button"
            className="maintenance-complete-btn"
            disabled={busyId === record.id}
            onClick={() => handleComplete(record.id)}
          >
            <Check size={14} />
            Complete
          </button>
        </div>
      )
    }

    if (record.status === 'open') {
      return (
        <button
          type="button"
          className="maintenance-complete-btn"
          disabled={busyId === record.id}
          onClick={() => handleComplete(record.id)}
        >
          <Check size={14} />
          Complete
        </button>
      )
    }

    return null
  }

  return (
    <div className="maintenance-page">
      <Sidebar />
      <Header />
      <div className="maintenance-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Fleet Maintenance</h1>
            <p className="page-subtitle">Track service records, customer requests, and vehicle downtime</p>
          </div>
          <button type="button" className="maintenance-add-btn" onClick={() => setShowForm(true)}>
            <Plus size={14} />
            New record
          </button>
        </div>

        {!loading && customerRequests.length > 0 ? (
          <section className="maintenance-incoming">
            <h2 className="maintenance-incoming__title">Incoming customer requests</h2>
            <ul className="maintenance-incoming-list">
              {customerRequests.map((record) => {
                const vehicle = vehicleMap.get(record.vehicleId)
                return (
                  <li key={record.id} className="maintenance-incoming-item">
                    <div>
                      <strong>{record.title}</strong>
                      <p className="maintenance-desc">
                        {vehicle?.name ?? record.vehicleId.slice(0, 8)}
                        {record.reporterName ? ` · ${record.reporterName}` : ''}
                      </p>
                      {record.description ? <p className="maintenance-desc">{record.description}</p> : null}
                    </div>
                    {renderActions(record)}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {showForm ? (
          <form className="maintenance-form-card" onSubmit={handleCreate}>
            <h2 className="maintenance-form-title">Log maintenance</h2>
            <label className="maintenance-field">
              Vehicle
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
                <option value="">Select vehicle…</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.status})
                  </option>
                ))}
              </select>
            </label>
            <label className="maintenance-field">
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Oil change, brake inspection…"
                required
              />
            </label>
            <label className="maintenance-field">
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional details"
                rows={3}
              />
            </label>
            <div className="maintenance-form-actions">
              <button type="button" className="maintenance-btn secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="maintenance-btn primary" disabled={submitting}>
                {submitting ? 'Saving…' : 'Create record'}
              </button>
            </div>
          </form>
        ) : null}

        <div className="maintenance-table-card">
          {loading ? (
            <div className="maintenance-empty">Loading maintenance records…</div>
          ) : records.length === 0 ? (
            <div className="maintenance-empty">
              <Wrench size={20} />
              <span>No maintenance records yet.</span>
            </div>
          ) : (
            <>
              <div className="maintenance-table-wrap">
                <table className="maintenance-table">
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>Title</th>
                      <th>Source</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => {
                      const vehicle = vehicleMap.get(record.vehicleId)
                      return (
                        <tr key={record.id}>
                          <td>{vehicle?.name ?? record.vehicleId.slice(0, 8)}</td>
                          <td>
                            <div className="maintenance-title">{record.title}</div>
                            {record.description ? (
                              <div className="maintenance-desc">{record.description}</div>
                            ) : null}
                            {record.scheduledAt ? (
                              <div className="maintenance-desc">
                                Scheduled {formatDate(record.scheduledAt)}
                              </div>
                            ) : null}
                            {record.photos?.length ? (
                              <div className="maintenance-photo-row">
                                {record.photos.map((url) => (
                                  <a key={url} href={url} target="_blank" rel="noreferrer">
                                    <img src={url} alt="" />
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            {record.source === 'customer' ? (
                              <span className="maintenance-source maintenance-source--customer">
                                Customer{record.reporterName ? ` · ${record.reporterName}` : ''}
                              </span>
                            ) : (
                              <span className="maintenance-source">Dealer</span>
                            )}
                          </td>
                          <td>
                            <span className={`maintenance-status maintenance-status--${record.status}`}>
                              {STATUS_LABELS[record.status] ?? record.status}
                            </span>
                          </td>
                          <td>{formatDate(record.createdAt)}</td>
                          <td>{renderActions(record)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="maintenance-pagination">
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

        {scheduleId ? (
          <div className="maintenance-modal-overlay" role="dialog" aria-modal="true">
            <div className="maintenance-modal">
              <h3>Schedule service</h3>
              <label className="maintenance-field">
                Service date
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                />
              </label>
              <div className="maintenance-form-actions">
                <button
                  type="button"
                  className="maintenance-btn secondary"
                  onClick={() => {
                    setScheduleId(null)
                    setScheduleDate('')
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="maintenance-btn primary"
                  disabled={busyId === scheduleId}
                  onClick={() => handleSchedule(scheduleId)}
                >
                  {busyId === scheduleId ? 'Saving…' : 'Save schedule'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
