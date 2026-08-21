import type { ComplaintStatus } from '@carflow/shared'
import { formatDate } from '@carflow/shared'
import { MessageSquare, Send } from 'lucide-react'
import type { FormEvent} from 'react';
import { useCallback, useEffect, useState } from 'react'
import { toast } from '../../hooks/useToast'
import {
  listMyComplaints,
  submitComplaint,
  type CustomerComplaintWithReplies,
} from '../../services/customerService'
import './SupportSection.css'

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
}

export default function SupportSection() {
  const [complaints, setComplaints] = useState<CustomerComplaintWithReplies[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listMyComplaints()
      setComplaints(data.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load support requests')
      setComplaints([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!subject.trim() || !message.trim()) {
      toast.error('Subject and message are required.')
      return
    }
    setSubmitting(true)
    try {
      await submitComplaint({
        category: 'account',
        subject: subject.trim(),
        description: message.trim(),
        priority: 'medium',
      })
      toast.success('Support request submitted.')
      setSubject('')
      setMessage('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="support-section">
      <div className="support-section-header">
        <MessageSquare size={18} />
        <div>
          <h2 className="support-section-title">Support</h2>
          <p className="support-section-desc">Track complaints and replies from the CarFlow team.</p>
        </div>
      </div>

      <form className="support-new-form" onSubmit={handleSubmit}>
        <h3>New request</h3>
        <label>
          Subject
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary of your issue"
          />
        </label>
        <label>
          Message
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what you need help with"
          />
        </label>
        <button type="submit" className="support-submit-btn" disabled={submitting}>
          <Send size={14} />
          {submitting ? 'Sending…' : 'Submit request'}
        </button>
      </form>

      <div className="support-history">
        <h3>Your requests</h3>
        {loading ? (
          <p className="support-muted">Loading…</p>
        ) : error ? (
          <p className="support-error">{error}</p>
        ) : complaints.length === 0 ? (
          <p className="support-muted">No support requests yet.</p>
        ) : (
          <ul className="support-complaint-list">
            {complaints.map((complaint) => (
              <li key={complaint.id} className="support-complaint-card">
                <div className="support-complaint-head">
                  <strong>{complaint.subject}</strong>
                  <span className={`support-status support-status--${complaint.status}`}>
                    {STATUS_LABEL[complaint.status]}
                  </span>
                </div>
                <p className="support-complaint-meta">
                  {complaint.category} · {formatDate(complaint.createdAt)}
                </p>
                <p className="support-complaint-body">{complaint.description}</p>
                {complaint.replies.length > 0 ? (
                  <ul className="support-replies">
                    {complaint.replies.map((reply) => (
                      <li
                        key={reply.id}
                        className={reply.fromSupport ? 'support-reply support-reply--support' : 'support-reply'}
                      >
                        <div className="support-reply-head">
                          <strong>{reply.fromSupport ? 'CarFlow support' : reply.authorName}</strong>
                          <time dateTime={reply.createdAt}>
                            {new Date(reply.createdAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </time>
                        </div>
                        <p>{reply.body}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="support-muted">No replies yet — our team will respond here.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
