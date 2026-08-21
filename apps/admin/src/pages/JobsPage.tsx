import { Play, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { AdminLayout } from '../layout/AdminLayout'
import { listJobRuns, runJobOnce, type JobRun } from '../services/adminService'
import './JobsPage.css'

const PAGE_SIZE = 20

export function JobsPage() {
  const { session } = useAuth()
  const canRun = session?.role === 'admin'
  const [runs, setRuns] = useState<JobRun[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    listJobRuns({ page, pageSize: PAGE_SIZE })
      .then((data) => {
        setRuns(data.items)
        setTotal(data.total)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load job runs'))
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => {
    refresh()
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleRunOnce = async () => {
    setRunning(true)
    try {
      const result = await runJobOnce()
      if (result.skipped) {
        toast.message('Job skipped — another run may be in progress')
      } else {
        toast.success('Scheduled jobs completed')
      }
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to run jobs')
    } finally {
      setRunning(false)
    }
  }

  return (
    <AdminLayout title="Jobs" subtitle="Scheduler run history and manual triggers">
      <div className="jobsPage">
        <div className="jobsIntro">
          <p>
            Background jobs handle invoicing, overdue rentals, reconciliation, payout generation, and
            reminder emails.
          </p>
          {canRun ? (
            <button type="button" className="jobsRunBtn" disabled={running} onClick={handleRunOnce}>
              <Play size={16} />
              {running ? 'Running…' : 'Run once'}
            </button>
          ) : null}
        </div>

        <div className="jobsTableCard">
          {loading ? (
            <div className="jobsEmpty">Loading job runs…</div>
          ) : runs.length === 0 ? (
            <div className="jobsEmpty">No job runs recorded yet.</div>
          ) : (
            <>
              <div className="jobsTableWrap">
                <table className="jobsTable">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Completed</th>
                      <th>Invoices</th>
                      <th>Overdue</th>
                      <th>Reminders</th>
                      <th>Reconciled</th>
                      <th>Payouts</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id}>
                        <td>{new Date(run.startedAt).toLocaleString()}</td>
                        <td>
                          {run.completedAt ? new Date(run.completedAt).toLocaleString() : '—'}
                        </td>
                        <td>{run.invoices}</td>
                        <td>{run.overdue}</td>
                        <td>{run.reminders}</td>
                        <td>{run.reconciled}</td>
                        <td>{run.payouts}</td>
                        <td className={run.error ? 'jobsErrorCell' : undefined}>{run.error ?? '—'}</td>
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
                <button type="button" className="jobsRefreshBtn" onClick={refresh}>
                  <RefreshCw size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
