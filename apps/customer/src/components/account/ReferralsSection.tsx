import { formatCurrency, formatDate } from '@carflow/shared'
import { Check, Copy, Gift, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from '../../hooks/useToast'
import { getReferralSummary, type ReferralSummary } from '../../services/customerService'
import '../../pages/SubscriptionBilling.css'

export default function ReferralsSection() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  useEffect(() => {
    getReferralSummary()
      .then(setSummary)
      .catch(() => toast.error('Could not load referral details'))
      .finally(() => setLoading(false))
  }, [])

  const copyText = useCallback(async (text: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      toast.success(kind === 'code' ? 'Code copied' : 'Link copied')
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error('Copy failed')
    }
  }, [])

  if (loading) {
    return (
      <div className="billing-section-embedded">
        <h2 className="section-title">Refer a friend</h2>
        <p className="billing-empty-hint">Loading…</p>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="billing-section-embedded">
        <h2 className="section-title">Refer a friend</h2>
        <p className="billing-empty-hint">Referral details are unavailable right now.</p>
      </div>
    )
  }

  return (
    <div className="billing-section-embedded referrals-section">
      <h2 className="section-title">Refer a friend</h2>
      <p className="settings-description" style={{ marginBottom: 16 }}>
        Share your code. When a friend completes their first subscription payment, you both receive store
        credit on your next invoice.
      </p>

      <div className="billing-stat-cards" style={{ marginBottom: 24 }}>
        <div className="billing-stat-card">
          <div className="billing-stat-label">Your code</div>
          <div className="billing-stat-value billing-stat-value--text">{summary.code}</div>
          <button
            type="button"
            className="billing-link-btn"
            onClick={() => void copyText(summary.code, 'code')}
          >
            {copied === 'code' ? <Check size={14} /> : <Copy size={14} />}
            {copied === 'code' ? 'Copied' : 'Copy code'}
          </button>
        </div>
        <div className="billing-stat-card">
          <div className="billing-stat-label">Credit balance</div>
          <div className="billing-stat-value">{formatCurrency(summary.creditBalance)}</div>
          <div className="billing-stat-hint">Applied automatically to your next due invoice</div>
        </div>
        <div className="billing-stat-card">
          <div className="billing-stat-label">Friends referred</div>
          <div className="billing-stat-value">{summary.referrals.length}</div>
          <div className="billing-stat-hint">
            {summary.creditedReferrals} credited · {summary.pendingReferrals} pending
          </div>
        </div>
      </div>

      <div className="billing-history-card" style={{ marginBottom: 24 }}>
        <h3 className="billing-section-title">Share link</h3>
        <p className="billing-empty-hint" style={{ wordBreak: 'break-all' }}>
          {summary.shareUrl}
        </p>
        <button
          type="button"
          className="billing-link-btn"
          onClick={() => void copyText(summary.shareUrl, 'link')}
        >
          {copied === 'link' ? <Check size={14} /> : <Copy size={14} />}
          {copied === 'link' ? 'Copied' : 'Copy signup link'}
        </button>
      </div>

      <div className="billing-history-card">
        <h3 className="billing-section-title">
          <Users size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Referral status
        </h3>
        {summary.referrals.length === 0 ? (
          <p className="billing-empty-hint">
            <Gift size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            No referrals yet — share your code to get started.
          </p>
        ) : (
          <div className="billing-table">
            <table>
              <thead>
                <tr>
                  <th>Friend</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {summary.referrals.map((row) => (
                  <tr key={row.id}>
                    <td>{row.referredName}</td>
                    <td>
                      <span
                        className={`status-badge ${row.status === 'credited' ? 'paid' : 'due'}`}
                      >
                        {row.status === 'credited' ? 'Credited' : 'Pending first payment'}
                      </span>
                    </td>
                    <td>{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
