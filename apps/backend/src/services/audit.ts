import { desc, eq, and, type SQL } from 'drizzle-orm'
import { db, type Db } from '../db/index.js'
import { auditLogs } from '../db/schema.js'

/** Either the root db or a drizzle transaction handle. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

export interface AuditEntry {
  actorId?: string | null
  actorRole?: string | null
  action: string
  entityType: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  note?: string | null
}

/**
 * Append-only audit trail for privileged and money-moving actions.
 * Callers inside a transaction should pass the tx so the audit entry commits
 * (or rolls back) atomically with the change it describes.
 */
export async function logAudit(executor: DbOrTx, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLogs).values({
    actorId: entry.actorId ?? null,
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before === undefined ? null : entry.before,
    after: entry.after === undefined ? null : entry.after,
    note: entry.note ?? null,
  })
}

/** Best-effort audit outside a transaction: failures are logged, never thrown. */
export async function logAuditSafe(entry: AuditEntry): Promise<void> {
  try {
    await logAudit(db, entry)
  } catch (err) {
    console.error('[audit] failed to record entry', entry.action, err)
  }
}

export async function listAuditLogs(params: {
  limit: number
  offset: number
  entityType?: string
  entityId?: string
}) {
  const filters: SQL[] = []
  if (params.entityType) filters.push(eq(auditLogs.entityType, params.entityType))
  if (params.entityId) filters.push(eq(auditLogs.entityId, params.entityId))
  const where = filters.length > 0 ? and(...filters) : undefined
  const base = db.select().from(auditLogs)
  const query = where ? base.where(where) : base
  return query.orderBy(desc(auditLogs.createdAt)).limit(params.limit).offset(params.offset)
}
