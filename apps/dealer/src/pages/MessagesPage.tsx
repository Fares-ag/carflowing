import { formatDate } from '@carflow/shared'
import { Loader2, Mail, MessageSquare, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import {
  getDealerMessageThread,
  listDealerMessageThreads,
  markDealerMessageRead,
  sendDealerMessage,
  type DealerMessage,
  type MessageThreadSummary,
} from '../services/dealerService'
import './MessagesPage.css'

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(date)
}

export function MessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [threads, setThreads] = useState<MessageThreadSummary[]>([])
  const [threadMessages, setThreadMessages] = useState<DealerMessage[]>([])
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)

  const activeSubject = searchParams.get('subject')
  const composeCustomerId = searchParams.get('customerId')
  const composeRentalId = searchParams.get('rentalId')
  const composeBookingRequestId = searchParams.get('bookingRequestId')
  const isComposeMode = Boolean(composeCustomerId && (composeRentalId || composeBookingRequestId))

  const refreshThreads = useCallback(async () => {
    setLoadingThreads(true)
    try {
      setThreads(await listDealerMessageThreads())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load messages')
      setThreads([])
    } finally {
      setLoadingThreads(false)
    }
  }, [])

  const loadThread = useCallback(
    async (subject: string) => {
      setLoadingThread(true)
      try {
        const items = await getDealerMessageThread(subject)
        setThreadMessages(items)
        await Promise.all(
          items
            .filter((message) => !message.read && message.folder === 'inbox')
            .map((message) => markDealerMessageRead(message.id, true).catch(() => undefined))
        )
        void refreshThreads()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load conversation')
        setThreadMessages([])
      } finally {
        setLoadingThread(false)
      }
    },
    [refreshThreads]
  )

  useEffect(() => {
    void refreshThreads()
  }, [refreshThreads])

  useEffect(() => {
    if (activeSubject) void loadThread(activeSubject)
    else setThreadMessages([])
  }, [activeSubject, loadThread])

  const activeThread = useMemo(
    () => threads.find((thread) => thread.threadSubject === activeSubject) ?? null,
    [threads, activeSubject]
  )

  const openThread = (subject: string) => {
    setSearchParams({ subject })
  }

  const resolveRecipientId = (): string | null => {
    if (isComposeMode && composeCustomerId) return composeCustomerId
    if (!threadMessages.length) return null
    const inbound = threadMessages.find((message) => message.folder === 'inbox')
    if (inbound) return inbound.fromUserId
    const outbound = threadMessages.find((message) => message.folder === 'sent')
    return outbound?.toUserId ?? null
  }

  const handleSend = async () => {
    const body = replyBody.trim()
    if (!body) return
    const toUserId = resolveRecipientId()
    if (!toUserId) {
      toast.error('Could not determine recipient')
      return
    }

    setSending(true)
    try {
      const sent = await sendDealerMessage({
        toUserId,
        body,
        rentalId: composeRentalId ?? undefined,
        bookingRequestId: composeBookingRequestId ?? undefined,
        replyToMessageId:
          activeSubject && !isComposeMode ? threadMessages[threadMessages.length - 1]?.id : undefined,
        subject: isComposeMode
          ? composeRentalId
            ? 'Rental conversation'
            : 'Booking request conversation'
          : undefined,
      })
      setReplyBody('')
      setSearchParams({ subject: sent.subject })
      await refreshThreads()
      await loadThread(sent.subject)
      toast.success('Message sent')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="dealer-layout">
      <Sidebar />
      <div className="main-content">
        <Header />
        <div className="dealer-messages-page">
          <aside className="dealer-messages-sidebar">
            <div className="dealer-messages-sidebar-header">
              <MessageSquare size={18} />
              <span>Conversations</span>
            </div>
            {loadingThreads ? (
              <div className="dealer-messages-state">
                <Loader2 className="dealer-messages-spinner" size={22} />
                <span>Loading…</span>
              </div>
            ) : threads.length === 0 && !isComposeMode ? (
              <div className="dealer-messages-state">
                <Mail size={28} />
                <p>No conversations yet.</p>
                <p className="dealer-messages-hint">Contact a customer from Booking Requests or Rentals.</p>
              </div>
            ) : (
              <ul className="dealer-messages-thread-list">
                {isComposeMode ? (
                  <li className="dealer-messages-thread is-active">
                    <strong>New conversation</strong>
                    <span>Draft to customer</span>
                  </li>
                ) : null}
                {threads.map((thread) => (
                  <li key={thread.threadSubject}>
                    <button
                      type="button"
                      className={`dealer-messages-thread ${activeSubject === thread.threadSubject ? 'is-active' : ''}`}
                      onClick={() => openThread(thread.threadSubject)}
                    >
                      <div className="dealer-messages-thread-top">
                        <strong>{thread.participantName ?? thread.participantEmail ?? 'Customer'}</strong>
                        {thread.unreadCount > 0 ? (
                          <span className="dealer-messages-unread">{thread.unreadCount}</span>
                        ) : null}
                      </div>
                      <span className="dealer-messages-thread-subject">{thread.displaySubject}</span>
                      <span className="dealer-messages-thread-preview">{thread.lastMessage.body}</span>
                      <time>{formatTimeAgo(thread.lastMessage.createdAt)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="dealer-messages-panel">
            {!activeSubject && !isComposeMode ? (
              <div className="dealer-messages-state dealer-messages-state--center">
                <MessageSquare size={36} />
                <p>Select a conversation or start one from a booking or rental.</p>
              </div>
            ) : (
              <>
                <div className="dealer-messages-panel-header">
                  <div>
                    <h2>
                      {isComposeMode
                        ? 'New message'
                        : activeThread?.participantName ?? activeThread?.participantEmail ?? 'Conversation'}
                    </h2>
                    {!isComposeMode && activeThread ? <p>{activeThread.displaySubject}</p> : null}
                  </div>
                </div>

                <div className="dealer-messages-thread-body">
                  {loadingThread && !isComposeMode ? (
                    <div className="dealer-messages-state">
                      <Loader2 className="dealer-messages-spinner" size={22} />
                    </div>
                  ) : (
                    threadMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`dealer-messages-bubble ${message.folder === 'sent' ? 'is-sent' : 'is-received'}`}
                      >
                        <div className="dealer-messages-bubble-meta">
                          <span>{message.folder === 'sent' ? 'You' : message.fromName ?? 'Customer'}</span>
                          <time>{formatTimeAgo(message.createdAt)}</time>
                        </div>
                        <p>{message.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="dealer-messages-compose">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={isComposeMode ? 'Write your first message…' : 'Write a reply…'}
                    rows={3}
                  />
                  <button type="button" disabled={sending || !replyBody.trim()} onClick={() => void handleSend()}>
                    <Send size={16} />
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
