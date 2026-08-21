import type { BookingRequestStatus, InvoiceStatus, RentalStatus } from '../types'

export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  reserved: 'Reserved',
  active: 'Active',
  paused: 'Paused',
  past_due: 'Past due',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
  refunded: 'Refunded',
  void: 'Void',
}

export const BOOKING_REQUEST_STATUS_LABELS: Record<BookingRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
}

export function rentalStatusLabel(status: RentalStatus): string {
  return RENTAL_STATUS_LABELS[status] ?? status
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  return INVOICE_STATUS_LABELS[status] ?? status
}

export function bookingRequestStatusLabel(status: BookingRequestStatus): string {
  return BOOKING_REQUEST_STATUS_LABELS[status] ?? status
}
