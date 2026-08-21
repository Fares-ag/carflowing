import type { Invoice } from '@carflow/shared'
import { formatCurrency } from '@carflow/shared'
import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import './OverdueInvoiceBanner.css'

const BILLING_PATH = '/settings?section=billing'

export function OverdueInvoiceBanner({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) return null

  const total = invoices.reduce((sum, invoice) => sum + invoice.amount, 0)
  const countLabel = invoices.length === 1 ? '1 overdue invoice' : `${invoices.length} overdue invoices`

  return (
    <div className="overdue-invoice-banner" role="status">
      <div className="overdue-invoice-banner__inner">
        <AlertTriangle size={18} aria-hidden="true" />
        <p className="overdue-invoice-banner__text">
          {countLabel} totaling {formatCurrency(total)}. Pay now to keep your subscription in good standing.
        </p>
        <Link to={BILLING_PATH} className="overdue-invoice-banner__action">
          Pay now
        </Link>
      </div>
    </div>
  )
}

export { BILLING_PATH as overdueBillingPath }
