import { formatDate } from '@carflow/shared'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { AdminLayout } from '../layout/AdminLayout'
import { listAuditLogs, type AuditLogEntry } from '../services/adminService'
import './AuditLogPage.css'

interface AuditFilters {
  entityType?: string
  entityId?: string
}

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entityTypeInput, setEntityTypeInput] = useState('')
  const [entityIdInput, setEntityIdInput] = useState('')
  const [filters, setFilters] = useState<AuditFilters>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setIsLoading(true)
    setError(null)
    listAuditLogs({ page, pageSize, ...filters })
      .then((data) => {
        setLogs(data.items)
        setTotal(data.total)
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to load audit logs'
        setError(msg)
        toast.error(msg)
      })
      .finally(() => setIsLoading(false))
  }, [page, pageSize, filters])

  useEffect(() => {
    refresh()
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const applyFilters = (event: FormEvent) => {
    event.preventDefault()
    setExpandedId(null)
    setPage(1)
    setFilters({
      entityType: entityTypeInput.trim() || undefined,
      entityId: entityIdInput.trim() || undefined,
    })
  }

  const clearFilters = () => {
    setEntityTypeInput('')
    setEntityIdInput('')
    setExpandedId(null)
    setPage(1)
    setFilters({})
  }

  if (error && logs.length === 0) {
    return (
      <AdminLayout title="Audit Log" subtitle="Every admin-relevant change, who made it, and what changed">
        <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>{error}</div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title="Audit Log" subtitle="Every admin-relevant change, who made it, and what changed">
      <div className="adminTableCard">
        <div className="adminTableHeader">
          <div>
            <div className="adminTableTitle">Audit Trail</div>
            <div className="adminTableSub">{total} entries</div>
          </div>
          <form className="auditFilters" onSubmit={applyFilters}>
            <label className="auditFilterField">
              <Search size={14} aria-hidden="true" />
              <input
                type="text"
                placeholder="Entity type (e.g. rental, payment)"
                aria-label="Filter by entity type"
                value={entityTypeInput}
                onChange={(event) => setEntityTypeInput(event.target.value)}
              />
            </label>
            <label className="auditFilterField">
              <Search size={14} aria-hidden="true" />
              <input
                type="text"
                placeholder="Entity ID"
                aria-label="Filter by entity ID"
                value={entityIdInput}
                onChange={(event) => setEntityIdInput(event.target.value)}
              />
            </label>
            <button className="adminSelectBtn" type="submit">Apply</button>
            {filters.entityType || filters.entityId ? (
              <button className="adminSelectBtn" type="button" onClick={clearFilters}>
                Clear
              </button>
            ) : null}
          </form>
        </div>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
        ) : (
          <>
            <div className="adminTableWrap">
              <table className="adminTable auditTable">
                <thead>
                  <tr>
                    <th aria-label="Expand"></th>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Entity ID</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="auditEmpty">
                        No audit entries match the current filters.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const isExpanded = expandedId === log.id
                      return (
                        <Fragment key={log.id}>
                          <tr className="auditRow">
                            <td>
                              <button
                                type="button"
                                className="auditExpandBtn"
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                                onClick={() => setExpandedId(isExpanded ? null : log.id)}
                              >
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </button>
                            </td>
                            <td className="adminTdMuted auditWhen">{formatDate(log.createdAt)}</td>
                            <td>
                              <div className="auditActor">
                                <span className="auditActorName">{log.actorName ?? 'system'}</span>
                                {log.actorRole ? (
                                  <span className="adminBadge adminBadge--blue">{log.actorRole}</span>
                                ) : null}
                              </div>
                            </td>
                            <td>
                              <code className="auditAction">{log.action}</code>
                            </td>
                            <td className="adminTdStrong">{log.entityType}</td>
                            <td className="adminTdMuted auditEntityId">{log.entityId ?? '—'}</td>
                            <td className="adminTdMuted auditNote">{log.note ?? '—'}</td>
                          </tr>
                          {isExpanded ? (
                            <tr className="auditDetailsRow">
                              <td colSpan={7}>
                                <div className="auditDiff">
                                  <div>
                                    <span>Before</span>
                                    <pre>{JSON.stringify(log.before ?? null, null, 2)}</pre>
                                  </div>
                                  <div>
                                    <span>After</span>
                                    <pre>{JSON.stringify(log.after ?? null, null, 2)}</pre>
                                  </div>
                                </div>
                                {log.actorEmail ? (
                                  <div className="auditActorEmail">Actor email: {log.actorEmail}</div>
                                ) : null}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="customersPagination" role="navigation" aria-label="Audit log pages">
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
    </AdminLayout>
  )
}
