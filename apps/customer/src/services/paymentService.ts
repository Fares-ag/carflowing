import { apiRequest } from '@carflow/shared'

export interface SkipCashPaymentIntent {
  paymentId: string
  payUrl: string
}

export interface SkipCashPaymentStatus {
  id: string
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  bookingRequestId?: string
}

export interface CreateSkipCashIntentInput {
  vehicleId: string
  note?: string
  contact?: { firstName?: string; lastName?: string; phone?: string; email?: string }
}

export async function createSkipCashPaymentIntent(
  input: CreateSkipCashIntentInput
): Promise<SkipCashPaymentIntent> {
  return apiRequest('/payments/skipcash/create-intent', { method: 'POST', body: input })
}

export async function getSkipCashPaymentStatus(paymentId: string): Promise<SkipCashPaymentStatus> {
  return apiRequest(`/payments/skipcash/status/${paymentId}`)
}
