import { formatDate } from '@carflow/shared'
import { Megaphone, Send } from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AdminLayout } from '../layout/AdminLayout'
import {
  createBroadcast,
  listBroadcasts,
  previewBroadcast,
  type AdminBroadcast,
  type BroadcastSegment,
} from '../services/adminService'
import './BroadcastsPage.css'

const SEGMENTS: { value: BroadcastSegment; label: string; description: string }[] = [
  { value: 'all_customers', label: 'All customers', description: 'Every active customer account' },
  { value: 'all_dealers', label: 'All dealers', description: 'Active dealer owner accounts' },
  { value: 'overdue_customers', label: 'Overdue customers', description: 'Customers with overdue invoices' },
  {
    value: 'active_subscribers',
    label: 'Active subscribers',
    description: 'Customers on active or past-due rentals',
  },
  { value: 'pending_dealers', label: 'Pending dealers', description: 'Dealer applications awaiting approval' },
]

export function BroadcastsPage() {
  const [items, setItems] = useState<AdminBroadcast[]>([])
  const [loading, setLoading] = useState(true)
  const [segment, setSegment] = useState<BroadcastSegment>('all_dealers')
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [inApp, setInApp] = useState(true)
  const [email, setEmail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const refreshHistory = useCallback(() => {
    listBroadcasts()
      .then((data) => setItems(data.items))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load broadcasts'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refreshHistory()
  }, [refreshHistory])

  useEffect(() => {
    setPreviewLoading(true)
    previewBroadcast(segment)
      .then((data) => setRecipientCount(data.recipientCount))
      .catch((err) => {
        setRecipientCount(null)
        toast.error(err instanceof Error ? err.message : 'Failed to preview audience')
      })
      .finally(() => setPreviewLoading(false))
  }, [segment])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and message are required')
      return
    }
    if (!inApp && !email) {
      toast.error('Choose at least one delivery channel')
      return
    }
    setConfirmOpen(true)
  }

  const handleConfirmSend = async () => {
    setSubmitting(true)
    try {
      const created = await createBroadcast({
        segment,
        subject: subject.trim(),
        body: body.trim(),
        channels: { inApp, email },
      })
      toast.success(`Announcement sent to ${created.sentCount} recipients`)
      setSubject('')
      setBody('')
      setConfirmOpen(false)
      refreshHistory()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to send broadcast')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminLayout title="Broadcasts" subtitle="Send announcements to customer and dealer segments">
      <div className="broadcastsPage">
        <form className="broadcastsForm" onSubmit={handleSubmit}>
          <h2 className="broadcastsFormTitle">
            <Megaphone size={18} />
            Compose announcement
          </h2>

          <label className="broadcastsField">
            Audience
            <select value={segment} onChange={(e) => setSegment(e.target.value as BroadcastSegment)}>
              {SEGMENTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="broadcastsHint">
              {SEGMENTS.find((option) => option.value === segment)?.description}
              {previewLoading
                ? ' · Calculating recipients…'
                : recipientCount != null
                  ? ` · ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`
                  : ''}
            </span>
          </label>

          <label className="broadcastsField">
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} />
          </label>

          <label className="broadcastsField">
            Message
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              required
              maxLength={10000}
              placeholder="Write the announcement body…"
            />
          </label>

          <fieldset className="broadcastsChannels">
            <legend>Channels</legend>
            <label>
              <input type="checkbox" checked={inApp} onChange={(e) => setInApp(e.target.checked)} />
              In-app notification
            </label>
            <label>
              <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
              Email (queued via outbox)
            </label>
          </fieldset>

          <button type="submit" className="broadcastsSendBtn" disabled={submitting || previewLoading}>
            <Send size={14} />
            Review and send
          </button>
        </form>

        <div className="broadcastsHistory">
          <h2 className="broadcastsFormTitle">Past broadcasts</h2>
          {loading ? (
            <div className="broadcastsEmpty">Loading history…</div>
          ) : items.length === 0 ? (
            <div className="broadcastsEmpty">No broadcasts sent yet.</div>
          ) : (
            <div className="broadcastsTableWrap">
              <table className="broadcastsTable">
                <thead>
                  <tr>
                    <th>Sent</th>
                    <th>Segment</th>
                    <th>Subject</th>
                    <th>Channels</th>
                    <th>Recipients</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>{item.segment.replace(/_/g, ' ')}</td>
                      <td>{item.subject}</td>
                      <td>
                        {[item.channels.inApp ? 'In-app' : null, item.channels.email ? 'Email' : null]
                          .filter(Boolean)
                          .join(', ')}
                      </td>
                      <td>{item.sentCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {confirmOpen ? (
          <div className="broadcastsOverlay" role="dialog" aria-modal="true">
            <div className="broadcastsModal">
              <h3>Confirm broadcast</h3>
              <p>
                Send <strong>{subject}</strong> to{' '}
                <strong>{recipientCount ?? 'unknown'} recipients</strong> in segment{' '}
                <strong>{segment.replace(/_/g, ' ')}</strong>?
              </p>
              <ul className="broadcastsConfirmList">
                <li>Channels: {[inApp ? 'In-app' : null, email ? 'Email' : null].filter(Boolean).join(', ')}</li>
                <li>This action is recorded and cannot be unsent.</li>
              </ul>
              <div className="broadcastsModalActions">
                <button
                  type="button"
                  className="broadcastsSecondaryBtn"
                  disabled={submitting}
                  onClick={() => setConfirmOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="broadcastsSendBtn"
                  disabled={submitting}
                  onClick={handleConfirmSend}
                >
                  {submitting ? 'Sending…' : 'Send now'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  )
}
