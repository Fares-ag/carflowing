/** Product analytics lifecycle events (append-only, distinct from audit_logs). */
export const ANALYTICS_EVENT_TYPES = [
  'signup',
  'email_verified',
  'booking_created',
  'booking_approved',
  'rental_activated',
  'invoice_generated',
  'invoice_paid',
  'invoice_overdue',
  'swap_requested',
  'cancel_requested',
  'refund_issued',
  'payout_paid',
  'complaint_opened',
] as const

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number]

export type AnalyticsEntityType =
  | 'profile'
  | 'booking_request'
  | 'rental'
  | 'invoice'
  | 'payment'
  | 'payout'
  | 'complaint'
  | 'swap_request'

export interface AnalyticsEventInput {
  eventType: AnalyticsEventType
  userId?: string | null
  entityType?: AnalyticsEntityType | null
  entityId?: string | null
  properties?: Record<string, unknown>
  occurredAt?: Date
}
