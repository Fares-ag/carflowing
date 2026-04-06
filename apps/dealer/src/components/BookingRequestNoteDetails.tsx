import type { ReactNode } from 'react'

/** Shape of JSON stored in booking_requests.note from customer checkout */
export interface BookingNotePayload {
  duration?: string
  durationMonths?: number
  startDate?: string
  quantity?: number
  notes?: string
  delivery?: {
    location?: string
    date?: string
    time?: string
  }
  contact?: {
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
  }
  paymentMethod?: string
  total?: number
}

export function parseBookingNotePayload(note: string | undefined): BookingNotePayload | null {
  if (!note?.trim()) return null
  try {
    const o = JSON.parse(note) as Record<string, unknown>
    if (!o || typeof o !== 'object') return null
    return o as BookingNotePayload
  } catch {
    return null
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '') return null
  return (
    <div className="brDetailRow">
      <span className="brDetailLabel">{label}</span>
      <span className="brDetailValue">{children}</span>
    </div>
  )
}

function formatQar(n: number | undefined): string | null {
  if (n == null || Number.isNaN(n)) return null
  return `QAR ${n.toLocaleString()}`
}

export function BookingRequestNoteDetails({ note }: { note: string | undefined }) {
  const parsed = parseBookingNotePayload(note)
  const delivery = parsed?.delivery
  const contact = parsed?.contact

  if (!parsed && !note?.trim()) {
    return <p className="brModalHint brModalHint--inline">No extra details were submitted with this request.</p>
  }

  if (!parsed) {
    return (
      <div className="brDetailFallback">
        <p className="brModalHint">Request note (raw)</p>
        <pre className="brModalPre">{note}</pre>
      </div>
    )
  }

  const hasStructured =
    parsed.duration != null ||
    parsed.startDate != null ||
    parsed.quantity != null ||
    parsed.notes != null ||
    delivery != null ||
    contact != null ||
    parsed.paymentMethod != null ||
    parsed.total != null

  if (!hasStructured) {
    return (
      <div className="brDetailFallback">
        <pre className="brModalPre">{note}</pre>
      </div>
    )
  }

  return (
    <div className="brDetailList">
      <Row label="Plan / duration">{parsed.duration}</Row>
      <Row label="Duration (months)">
        {parsed.durationMonths != null ? String(parsed.durationMonths) : null}
      </Row>
      <Row label="Rental start date">{parsed.startDate}</Row>
      <Row label="Quantity">{parsed.quantity != null ? String(parsed.quantity) : null}</Row>

      {(delivery?.location || delivery?.date || delivery?.time) && (
        <>
          <div className="brDetailSubhead">Delivery & schedule</div>
          <Row label="Location">{delivery?.location}</Row>
          <Row label="Date">{delivery?.date}</Row>
          <Row label="Time">{delivery?.time}</Row>
        </>
      )}

      {(contact?.firstName ||
        contact?.lastName ||
        contact?.email ||
        contact?.phone) && (
        <>
          <div className="brDetailSubhead">Contact (from checkout)</div>
          <Row label="Name">
            {[contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || null}
          </Row>
          <Row label="Email">{contact?.email}</Row>
          <Row label="Phone">{contact?.phone}</Row>
        </>
      )}

      <Row label="Payment">{parsed.paymentMethod?.replace(/_/g, ' ')}</Row>
      <Row label="Estimated total">{formatQar(parsed.total)}</Row>
      <Row label="Customer notes">{parsed.notes}</Row>
    </div>
  )
}
