import { applySkipCashOutcome } from './paymentSettlement.js'
import { requestSkipCashRefund } from './skipcash.js'

export type PaymentProviderId = 'skipcash' | 'stripe' | 'manual'

export interface ProviderRefundResult {
  refunded: boolean
  message?: string
}

export interface PaymentProvider {
  id: PaymentProviderId
  settleWebhook(params: {
    paymentId: string
    statusId: number
    reportedAmount?: string | null
  }): ReturnType<typeof applySkipCashOutcome>
  requestRefund(params: { externalPaymentId: string; amount: number }): Promise<ProviderRefundResult>
}

const skipCashProvider: PaymentProvider = {
  id: 'skipcash',
  settleWebhook: applySkipCashOutcome,
  requestRefund: requestSkipCashRefund,
}

/** Stripe is wired as a second PSP stub — settlement still flows through paymentSettlement. */
const stripeProvider: PaymentProvider = {
  id: 'stripe',
  settleWebhook: async () => ({ handled: false, action: 'stripe-not-configured' }),
  requestRefund: async () => ({
    refunded: false,
    message: 'Stripe refunds are not configured. Process manually and retry with manualConfirmed.',
  }),
}

const manualProvider: PaymentProvider = {
  id: 'manual',
  settleWebhook: async () => ({ handled: false, action: 'manual-provider' }),
  requestRefund: async () => ({ refunded: false, message: 'Manual refunds require manualConfirmed.' }),
}

const registry: Record<PaymentProviderId, PaymentProvider> = {
  skipcash: skipCashProvider,
  stripe: stripeProvider,
  manual: manualProvider,
}

export function getPaymentProvider(id: string | null | undefined): PaymentProvider {
  if (id === 'stripe') return registry.stripe
  if (id === 'manual') return registry.manual
  return registry.skipcash
}
