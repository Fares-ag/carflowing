import { formatDate, formatDateOrDash } from '@carflow/shared'
import { Check, Wrench } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AdminLayout } from '../layout/AdminLayout'
import {
  completeAdminMaintenance,
  listAdminMaintenance,
  type AdminMaintenanceRecord,
} from '../services/adminService'
import './MaintenancePage.css'

const PAGE_SIZE = 20

export function MaintenancePage() {
  const [records, setRecords] = useState<AdminMaintenanceRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    listAdminMaintenance({
      page,
      pageSize: PAGE_SIZE,
      status: statusFilter === 'all' ? undefined : statusFilter,
    })
      .then((data) => {
        setRecords(data.items)
        setTotal(data.total)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load maintenance'))
      .finally(() => setLoading(false))
  }, [page, statusFilter])

  useEffect(() => {
    refresh()
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleComplete = async (id: string) => {
    setBusyId(id)
    try {
      await completeAdminMaintenance(id)
      toast.success('Maintenance completed')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to complete maintenance')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AdminLayout title="Maintenance" subtitle="Fleet maintenance console across all dealers">
      <div className="adminMaintenancePage">
        <div className="adminMaintenanceToolbar">
          <label className="adminMaintenanceFilter">
            Status
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        </div>

        <div className="adminMaintenanceCard">
          {loading ? (
            <div className="adminMaintenanceEmpty">Loading maintenance records…</div>
          ) : records.length === 0 ? (
            <div className="adminMaintenanceEmpty">
              <Wrench size={20} />
              <span>No maintenance records found.</span>
            </div>
          ) : (
            <>
              <div className="adminMaintenanceTableWrap">
                <table className="adminMaintenanceTable">
                  <thead>
                    <tr>
                      <th>Dealer</th>
                      <th>Vehicle</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id}>
                        <td>{record.dealerId.slice(0, 8)}</td>
                        <td>{record.vehicleId.slice(0, 8)}</td>
                        <td>
                          <div className="adminMaintenanceTitle">{record.title}</div>
                          {record.description ? (
                            <div className="adminMaintenanceDesc">{record.description}</div>
                          ) : null}
                        </td>
                        <td>
                          <span className={`adminMaintenanceStatus adminMaintenanceStatus--${record.status}`}>
                            {record.status}
                          </span>
                        </td>
                        <td>{formatDate(record.createdAt)}</td>
                        <td>
                          {record.status === 'open' ? (
                            <button
                              type="button"
                              className="adminMaintenanceCompleteBtn"
                              disabled={busyId === record.id}
                              onClick={() => handleComplete(record.id)}
                            >
                              <Check size={14} />
                              Complete
                            </button>
                          ) : (
                            formatDateOrDash(record.completedAt)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="customersPagination">
                <button
                  type="button"
                  className="customersPaginationBtn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span className="customersPaginationStatus">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="customersPaginationBtn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
