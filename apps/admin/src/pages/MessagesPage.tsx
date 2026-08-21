import {
  Archive,
  ArchiveRestore,
  Loader2,
  Mail,
  MailCheck,
  MessageCircle,
  Search,
  Send,
  Star,
  StarOff,
  Timer,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { AdminLayout } from '../layout/AdminLayout'
import {
  archiveMessage,
  createMessage,
  getMessageFolderCounts,
  listCustomers,
  listMessages,
  listMessagesActivitySample,
  starMessage,
  unarchiveMessage,
  unstarMessage,
  updateMessageRead,
  type MessageWithSender,
} from '../services/adminService'
import './MessagesPage.css'

const PAGE_SIZE = 50

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function resolveToUserId(input: string): Promise<string> {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Recipient is required')
  if (UUID_RE.test(trimmed)) return trimmed
  const email = trimmed.toLowerCase()
  const data = await listCustomers({ pageSize: 100 })
  const match = data.items.find((u) => u.email.toLowerCase() === email)
  if (!match) {
    throw new Error(`No user found for "${trimmed}". Enter a valid email or user id.`)
  }
  return match.id
}

const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diffMs = now - d.getTime()
  if (diffMs < 0) return 'Just now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return '1d ago'
  return `${days}d ago`
}

function senderDisplayName(msg: MessageWithSender): string {
  const n = msg.sender?.name?.trim() || msg.fromName?.trim()
  if (n) return n
  const e = msg.sender?.email?.trim() || msg.fromEmail?.trim()
  if (e) return e
  return 'Unknown sender'
}

function senderType(msg: MessageWithSender): string {
  const r = (msg.sender?.role ?? msg.fromRole ?? '').toLowerCase()
  if (r === 'dealer' || r === 'customer') return r
  if (r === 'admin') return 'admin'
  return r || 'user'
}

function folderListTitle(folder: string): string {
  if (!folder) return 'Inbox'
  return folder.charAt(0).toUpperCase() + folder.slice(1)
}

export function MessagesPage() {
  const { session } = useAuth()
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [messagesTotal, setMessagesTotal] = useState(0)
  const [messagePage, setMessagePage] = useState(1)
  const [folderCounts, setFolderCounts] = useState({
    total: 0,
    unreadInbox: 0,
    starred: 0,
    archived: 0,
    inbox: 0,
    sent: 0,
  })
  const [activitySample, setActivitySample] = useState<
    Array<{ createdAt: string; folder: MessageWithSender['folder'] }>
  >([])
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [activeFolder, setActiveFolder] = useState<'inbox' | 'sent' | 'starred' | 'archived'>('inbox')
  const [showCompose, setShowCompose] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshMessages = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [listRes, counts, activity] = await Promise.all([
        listMessages({ page: messagePage, pageSize: PAGE_SIZE, folder: activeFolder }),
        getMessageFolderCounts(),
        listMessagesActivitySample(500),
      ])
      setMessages(listRes.items)
      setMessagesTotal(listRes.total)
      setFolderCounts({
        inbox: counts.inbox ?? 0,
        sent: counts.sent ?? 0,
        starred: counts.starred ?? 0,
        archived: counts.archived ?? 0,
        unreadInbox: counts.unread ?? 0,
        total:
          (counts.inbox ?? 0) +
          (counts.sent ?? 0) +
          (counts.starred ?? 0) +
          (counts.archived ?? 0),
      })
      setActivitySample(activity)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [messagePage, activeFolder])

  useEffect(() => {
    void refreshMessages()
  }, [refreshMessages])

  const inboxUnreadCount = folderCounts.unreadInbox

  const folders = useMemo(
    (): Array<{
      key: 'inbox' | 'sent' | 'starred' | 'archived'
      label: string
      icon: ReactNode
      badge?: string
    }> => [
      {
        key: 'inbox',
        label: 'Inbox',
        icon: <Mail size={16} />,
        badge: inboxUnreadCount > 0 ? String(inboxUnreadCount) : undefined,
      },
      { key: 'sent', label: 'Sent', icon: <Send size={16} /> },
      { key: 'starred', label: 'Starred', icon: <Star size={16} /> },
      { key: 'archived', label: 'Archived', icon: <Archive size={16} /> },
    ],
    [inboxUnreadCount]
  )

  const messageRows = useMemo(() => {
    return messages.map((message) => {
      const name = senderDisplayName(message)
      const initials =
        name
          .split(/[\s@]+/)
          .map(part => part[0])
          .filter(Boolean)
          .join('')
          .slice(0, 3)
          .toUpperCase() || '?'
      const type = senderType(message)

      return {
        id: message.id,
        name,
        initials,
        type,
        subject: message.subject,
        preview: message.body,
        time: formatRelativeTime(message.createdAt),
        unread: !message.read,
        folder: message.folder,
      }
    })
  }, [messages])

  const filteredMessages = useMemo(() => {
    const normalizedType = typeFilter.toLowerCase()
    const base =
      normalizedType === 'all'
        ? messageRows
        : messageRows.filter(row => row.type.toLowerCase() === normalizedType)
    if (!searchQuery.trim()) return base
    const query = searchQuery.toLowerCase()
    return base.filter(row =>
      [row.name, row.subject, row.preview].some(value => value.toLowerCase().includes(query))
    )
  }, [messageRows, searchQuery, typeFilter])

  const stats = useMemo(
    () =>
      [
        { label: 'Total Messages', value: String(folderCounts.total), icon: <MessageCircle size={18} />, tone: 'blue' },
        { label: 'Unread', value: String(folderCounts.unreadInbox), icon: <Mail size={18} />, tone: 'orange' },
        { label: 'Starred', value: String(folderCounts.starred), icon: <Star size={18} />, tone: 'amber' },
        { label: 'Archived', value: String(folderCounts.archived), icon: <Archive size={18} />, tone: 'gray' },
      ] as const,
    [folderCounts]
  )

  const activityData = useMemo(() => {
    const byMonFirst = new Map<string, { day: string; received: number; sent: number }>()
    for (const label of WEEKDAY_ORDER) {
      byMonFirst.set(label, { day: label, received: 0, sent: 0 })
    }
    for (const row of activitySample) {
      const d = new Date(row.createdAt)
      const js = d.getDay()
      const label = js === 0 ? 'Sun' : WEEKDAY_ORDER[js - 1]
      const bucket = byMonFirst.get(label)
      if (!bucket) continue
      if (row.folder === 'sent') bucket.sent += 1
      else bucket.received += 1
    }
    return WEEKDAY_ORDER.map((label) => byMonFirst.get(label)!)
  }, [activitySample])

  const showActivityChart = activitySample.length > 0

  const totalPages = Math.max(1, Math.ceil(messagesTotal / PAGE_SIZE))

  return (
    <AdminLayout title="Messages" subtitle="Communication center">
      <div className="messagesPage">
        <div className="messagesHeader">
          <div>
            <h2>Messages Center</h2>
            <p>Manage all communications with customers and dealers</p>
          </div>
          <button className="messagesCompose" type="button" onClick={() => setShowCompose(true)}>
            <MailCheck size={16} />
            Compose Message
          </button>
        </div>

        <div className="messagesStats">
          {stats.map((stat) => (
            <div key={stat.label} className="messagesStatCard">
              <div className={`messagesStatIcon messagesStatIcon--${stat.tone}`}>{stat.icon}</div>
              <div className="messagesStatLabel">{stat.label}</div>
              <div className="messagesStatValue">{stat.value}</div>
            </div>
          ))}
        </div>

        {loadError && (
          <div className="messagesErrorBanner" role="alert">
            <span>{loadError}</span>
            <button type="button" className="messagesRetryBtn" onClick={() => void refreshMessages()}>
              Retry
            </button>
          </div>
        )}

        <div className="messagesActivity">
          <div className="messagesCardTitle">
            <MessageCircle size={16} />
            Message activity by day of week
          </div>
          {showActivityChart ? (
            <>
              <div className="messagesChart">
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={activityData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="received" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    <Line type="monotone" dataKey="sent" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="messagesChartLegend">
                <div className="messagesLegendItem">
                  <span className="messagesLegendDot messagesLegendDot--received" />
                  Received (non-sent)
                </div>
                <div className="messagesLegendItem">
                  <span className="messagesLegendDot messagesLegendDot--sent" />
                  Sent
                </div>
              </div>
            </>
          ) : (
            <div className="messagesChartPlaceholder">Not enough data for activity chart</div>
          )}
        </div>

        <div className="messagesSplit">
          <div className="messagesSidebar">
            <div className="messagesSidebarContent">
              <div className="messagesFolders">
                {folders.map((folder) => (
                  <button
                    key={folder.key}
                    className={`messagesFolder ${activeFolder === folder.key ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => {
                      setActiveFolder(folder.key)
                      setMessagePage(1)
                    }}
                  >
                    {folder.icon}
                    {folder.label}
                    {folder.badge && <span className="messagesFolderBadge">{folder.badge}</span>}
                  </button>
                ))}
              </div>
              <div className="messagesSidebarDivider" />
              <div className="messagesFilter">
                <div className="messagesFilterLabel">Filter by Type</div>
                <label className="messagesFilterSelect">
                  <select
                    aria-label="Filter messages by type"
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                  >
                    <option value="all">All Users</option>
                    <option value="dealer">Dealers</option>
                    <option value="customer">Customers</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="messagesList">
            <div className="messagesListHeader">
              <div className="messagesListTitle">{folderListTitle(activeFolder)}</div>
              <div className="messagesSearch">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>
            {loading ? (
              <div className="messagesLoadingState">
                <Loader2 className="messagesLoadingSpinner" size={28} aria-hidden />
                <p>Loading messages…</p>
              </div>
            ) : (
              <>
                <div className="messagesListBody">
                  {filteredMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`messagesItem ${message.unread ? 'is-unread' : ''}`}
                      onClick={() => {
                        if (message.unread) {
                          updateMessageRead(message.id, true)
                            .then(() => void refreshMessages())
                            .catch((err) =>
                              toast.error(err instanceof Error ? err.message : 'Failed to mark read')
                            )
                        }
                      }}
                    >
                      <div className="messagesAvatar">{message.initials}</div>
                      <div className="messagesItemContent">
                        <div className="messagesItemHeader">
                          <div className="messagesItemName">
                            {message.name}
                            <span className="messagesTypeBadge">
                              {message.type === 'dealer' ? <Users size={12} /> : <UserRound size={12} />}
                              {message.type}
                            </span>
                          </div>
                          <div className="messagesItemTime">
                            {message.unread && <span className="messagesUnreadDot" />}
                            {message.type === 'customer' && message.unread ? (
                              <span>{message.time}</span>
                            ) : (
                              <>
                                <Timer size={12} />
                                <span>{message.time}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="messagesItemSubject">{message.subject}</div>
                        <div className="messagesItemPreview">{message.preview}</div>
                      </div>
                      <div className="messagesItemActions">
                        <button
                          type="button"
                          className="messagesRowIconBtn"
                          title={message.folder === 'starred' ? 'Remove star' : 'Star'}
                          aria-label={message.folder === 'starred' ? 'Remove star' : 'Star message'}
                          onClick={(e) => {
                            e.stopPropagation()
                            const op = message.folder === 'starred' ? unstarMessage(message.id) : starMessage(message.id)
                            op
                              .then(() => void refreshMessages())
                              .catch((err) =>
                                toast.error(err instanceof Error ? err.message : 'Failed to update star')
                              )
                          }}
                        >
                          {message.folder === 'starred' ? <StarOff size={16} /> : <Star size={16} />}
                        </button>
                        <button
                          type="button"
                          className="messagesRowIconBtn"
                          title={message.folder === 'archived' ? 'Unarchive' : 'Archive'}
                          aria-label={message.folder === 'archived' ? 'Unarchive message' : 'Archive message'}
                          onClick={(e) => {
                            e.stopPropagation()
                            const op =
                              message.folder === 'archived'
                                ? unarchiveMessage(message.id)
                                : archiveMessage(message.id)
                            op
                              .then(() => void refreshMessages())
                              .catch((err) =>
                                toast.error(err instanceof Error ? err.message : 'Failed to update archive')
                              )
                          }}
                        >
                          {message.folder === 'archived' ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="messagesPagination">
                  <button
                    type="button"
                    className="messagesPaginationBtn"
                    disabled={messagePage <= 1}
                    onClick={() => setMessagePage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="messagesPaginationMeta">
                    Page {messagePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="messagesPaginationBtn"
                    disabled={messagePage >= totalPages}
                    onClick={() => setMessagePage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {showCompose && (
          <div className="messagesModalOverlay" role="dialog" aria-modal="true">
            <div className="messagesModal">
              <button
                className="messagesModalClose"
                type="button"
                aria-label="Close compose modal"
                onClick={() => {
                  setShowCompose(false)
                  setComposeError(null)
                }}
              >
                <X size={16} />
              </button>
              <h3>Compose Message</h3>
              <label>
                To
                <input
                  type="text"
                  placeholder="Recipient email or user id (UUID)"
                  value={composeTo}
                  onChange={(event) => setComposeTo(event.target.value)}
                />
              </label>
              <label>
                Subject
                <input
                  type="text"
                  placeholder="Subject"
                  value={composeSubject}
                  onChange={(event) => setComposeSubject(event.target.value)}
                />
              </label>
              <label>
                Message
                <textarea
                  rows={4}
                  placeholder="Write your message..."
                  value={composeBody}
                  onChange={(event) => setComposeBody(event.target.value)}
                />
              </label>
              {composeError && <p className="messagesComposeError">{composeError}</p>}
              <div className="messagesModalActions">
                <button
                  className="messagesModalBtn"
                  type="button"
                  onClick={() => {
                    setShowCompose(false)
                    setComposeError(null)
                  }}
                >
                  Cancel
                </button>
                <button
                  className="messagesModalBtn messagesModalBtn--primary"
                  type="button"
                  disabled={
                    composeSending ||
                    !composeTo.trim() ||
                    !composeSubject.trim() ||
                    !composeBody.trim() ||
                    !session?.userId
                  }
                  onClick={async () => {
                    if (!composeSubject.trim() || !composeBody.trim() || !session?.userId) return
                    setComposeError(null)
                    setComposeSending(true)
                    try {
                      const toUserId = await resolveToUserId(composeTo)
                      await createMessage(session.userId, {
                        toUserId,
                        subject: composeSubject.trim(),
                        body: composeBody.trim(),
                      })
                      setComposeTo('')
                      setComposeSubject('')
                      setComposeBody('')
                      setShowCompose(false)
                      setActiveFolder('sent')
                      setMessagePage(1)
                    } catch (e) {
                      setComposeError(e instanceof Error ? e.message : 'Failed to send')
                    } finally {
                      setComposeSending(false)
                    }
                  }}
                >
                  {composeSending ? 'Sending…' : 'Send Message'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
