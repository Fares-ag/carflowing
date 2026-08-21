import type { AnalyticsEventInput } from '@carflow/shared/analytics/events'
import { analyticsEvents } from '../db/schema.js'
import { db, type Db } from '../db/index.js'

/** Either the root db or a drizzle transaction handle. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/** Append a product analytics event. Never throws — failures are logged. */
export async function trackAnalyticsEvent(
  executor: DbOrTx,
  input: AnalyticsEventInput
): Promise<void> {
  try {
    await executor.insert(analyticsEvents).values({
      eventType: input.eventType,
      userId: input.userId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      properties: input.properties ?? {},
      occurredAt: input.occurredAt ?? new Date(),
    })
  } catch (err) {
    console.error('[analytics] failed to record event', input.eventType, err)
  }
}

/** Fire-and-forget wrapper for routes/services outside a transaction. */
export function trackAnalyticsEventSafe(input: AnalyticsEventInput): void {
  void trackAnalyticsEvent(db, input)
}
