import { db } from '../db/index.js'
import { notifications } from '../db/schema.js'
import type { DbOrTx } from './audit.js'

export type NotificationKind = 'info' | 'warning' | 'success' | 'error'

/**
 * In-app notification writer. All business events funnel through here so the
 * notification bell in every portal reflects reality.
 */
export async function notifyUser(
  executor: DbOrTx,
  params: { userId: string; type?: NotificationKind; title: string; message: string }
): Promise<void> {
  await executor.insert(notifications).values({
    userId: params.userId,
    type: params.type ?? 'info',
    title: params.title,
    message: params.message,
  })
}

/** Notifies the owner account of a dealer (dealer portals key off the owner user). */
export async function notifyDealerOwner(
  executor: DbOrTx,
  dealerId: string,
  params: { type?: NotificationKind; title: string; message: string }
): Promise<void> {
  const { dealers } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')
  const [dealer] = await executor
    .select({ ownerUserId: dealers.ownerUserId })
    .from(dealers)
    .where(eq(dealers.id, dealerId))
    .limit(1)
  if (dealer) {
    await notifyUser(executor, { userId: dealer.ownerUserId, ...params })
  }
}

/** Best-effort variant for use outside transactions: never throws. */
export async function notifyUserSafe(params: {
  userId: string
  type?: NotificationKind
  title: string
  message: string
}): Promise<void> {
  try {
    await notifyUser(db, params)
  } catch (err) {
    console.error('[notify] failed to create notification', params.title, err)
  }
}
