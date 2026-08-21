import {
  formatCurrency,
  SUBSCRIPTION_PRICING_LABELS,
  SUBSCRIPTION_VALUE_PROPS,
} from '@carflow/shared'
import './SubscriptionPricingSummary.css'

export interface SubscriptionPricingSummaryProps {
  monthly: number
  firstMonthTotal: number
  durationMonths: number
  minimumTermTotal: number
  depositAmount?: number
  showValueProps?: boolean
  className?: string
}

export function SubscriptionPricingSummary({
  monthly,
  firstMonthTotal,
  durationMonths,
  minimumTermTotal,
  depositAmount = 0,
  showValueProps = false,
  className = '',
}: SubscriptionPricingSummaryProps) {
  const dueToday = firstMonthTotal + (depositAmount > 0 ? depositAmount : 0)
  return (
    <div className={`subscription-pricing ${className}`.trim()}>
      <div className="subscription-pricing__row subscription-pricing__row--primary">
        <span>{SUBSCRIPTION_PRICING_LABELS.monthly}</span>
        <strong>{formatCurrency(monthly)}/mo</strong>
      </div>
      {depositAmount > 0 && (
        <div className="subscription-pricing__row">
          <span>Refundable security deposit</span>
          <span>{formatCurrency(depositAmount)}</span>
        </div>
      )}
      <div className="subscription-pricing__row">
        <span>{SUBSCRIPTION_PRICING_LABELS.dueToday}</span>
        <span>{formatCurrency(dueToday)}</span>
      </div>
      <div className="subscription-pricing__row subscription-pricing__row--muted">
        <span>{SUBSCRIPTION_PRICING_LABELS.minimumTerm(durationMonths)}</span>
        <span>{formatCurrency(minimumTermTotal)}</span>
      </div>
      {showValueProps && (
        <ul className="subscription-pricing__props">
          {SUBSCRIPTION_VALUE_PROPS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
