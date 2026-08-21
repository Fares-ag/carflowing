import type { Payment } from '@carflow/shared/types'
import type { CartItem, CartVehicle } from '../stores/cartStore'
import { getVehicle } from '../services/customerService'

type CheckoutNote = {
  duration?: string
  durationMonths?: number
  startDate?: string
  quantity?: number
  notes?: string
  total?: number
  paymentMethod?: string
}

/** Rehydrate the persisted cart from a stored checkout note after a failed payment. */
export async function restoreCheckoutCartFromNote(
  note: string | undefined,
  vehicleId: string | undefined,
  setVehicle: (vehicle: CartVehicle | null) => void,
  setCart: (cart: CartItem | null) => void
): Promise<void> {
  if (!note || !vehicleId) return
  let parsed: CheckoutNote
  try {
    parsed = JSON.parse(note) as CheckoutNote
  } catch {
    return
  }

  try {
    const vehicle = await getVehicle(vehicleId)
    setVehicle({
      id: vehicle.id,
      name: vehicle.name,
      make: vehicle.make,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      seats: vehicle.seats,
      image: vehicle.imageUrl ?? vehicle.imageUrls?.[0],
      pricePerDay: vehicle.pricePerDay,
    })
  } catch {
    setVehicle({
      id: vehicleId,
      name: 'Your selected car',
      make: '',
    })
  }

  const durationMonths = Number(parsed.durationMonths) || 1
  setCart({
    vehicleId,
    vehicleName: 'Your selected car',
    vehicleMake: '',
    durationLabel: parsed.duration ?? `${durationMonths} month${durationMonths > 1 ? 's' : ''} minimum`,
    durationMonths,
    quantity: parsed.quantity ?? 1,
    startDate: parsed.startDate ?? new Date().toISOString().slice(0, 10),
    notes: parsed.notes ?? note,
    subtotal: Number(parsed.total) || 0,
    total: Number(parsed.total) || 0,
  })
}

export const INVOICE_PAYMENT_SESSION_KEY = 'carflow-invoice-payment'

export function rememberInvoicePaymentAttempt(invoiceId: string, paymentId: string): void {
  sessionStorage.setItem(INVOICE_PAYMENT_SESSION_KEY, JSON.stringify({ invoiceId, paymentId }))
}

export function clearInvoicePaymentAttempt(): void {
  sessionStorage.removeItem(INVOICE_PAYMENT_SESSION_KEY)
}

export function readInvoicePaymentAttempt(): { invoiceId: string; paymentId: string } | null {
  const raw = sessionStorage.getItem(INVOICE_PAYMENT_SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { invoiceId?: string; paymentId?: string }
    if (parsed.invoiceId && parsed.paymentId) {
      return { invoiceId: parsed.invoiceId, paymentId: parsed.paymentId }
    }
  } catch {
    sessionStorage.removeItem(INVOICE_PAYMENT_SESSION_KEY)
  }
  return null
}

export function isRentalPayment(payment: Pick<Payment, 'type'>): boolean {
  return payment.type === 'rental'
}

export function isSubscriptionPayment(payment: Pick<Payment, 'type'>): boolean {
  return payment.type === 'subscription'
}
