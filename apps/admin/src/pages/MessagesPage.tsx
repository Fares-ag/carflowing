import { useEffect, useMemo, useState } from 'react'
import type { Message } from '@carflow/shared'
import { listMessages, updateMessageRead } from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import {
  Archive,
  ChevronDown,
  Mail,
  MailCheck,
  MessageCircle,
  Search,
  Send,
  Star,
  Timer,
  UserRound,
  Users,
  X,
} from 'lucide-react'
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
import './MessagesPage.css'

const FOLDERS = [
  { key: 'inbox', label: 'Inbox', icon: <Mail size={16} />, badge: '3' },
  { key: 'sent', label: 'Sent', icon: <Send size={16} /> },
  { key: 'starred', label: 'Starred', icon: <Star size={16} /> },
  { key: 'archived', label: 'Archived', icon: <Archive size={16} /> },
] as const

export function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [activeFolder, setActiveFolder] = useState('inbox')
  const [showCompose, setShowCompose] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')

  const refreshMessages = () => {
    listMessages({ pageSize: 12 }).then((data) => setMessages(data.items))
  }

  useEffect(() => {
    refreshMessages()
  }, [])

  const messageRows = useMemo(() => {
    return messages.map((message, index) => {
      const name = index % 3 === 0 ? `Dealer ${index + 1}` : `Customer ${index + 1}`
      const initials = name
        .split(' ')
        .map(part => part[0])
        .join('')
        .slice(0, 3)
      const type = index % 3 === 0 ? 'dealer' : 'customer'

      return {
        id: message.id,
        name,
        initials,
        type,
        subject: message.subject,
        preview: message.body,
        time: `${index + 1}d ago`,
        unread: !message.read,
        folder: message.folder,
      }
    })
  }, [messages])

  const filteredMessages = useMemo(() => {
    const normalizedType = typeFilter.toLowerCase()
    const base = normalizedType === 'all'
      ? messageRows
      : messageRows.filter(row => row.type.toLowerCase() === normalizedType)
    const folderFiltered = base.filter(row => row.folder === activeFolder)
    if (!searchQuery.trim()) return folderFiltered
    const query = searchQuery.toLowerCase()
    return folderFiltered.filter(row =>
      [row.name, row.subject, row.preview].some(value => value.toLowerCase().includes(query))
    )
  }, [messageRows, searchQuery, typeFilter, activeFolder])

  const stats = useMemo(() => {
    const total = messageRows.length
    const unread = messageRows.filter(row => row.unread).length
    const starred = messageRows.filter((_, index) => index % 4 === 0).length
    const archived = messageRows.filter((_, index) => index % 5 === 0).length

    return [
      { label: 'Total Messages', value: String(total), icon: <MessageCircle size={18} />, tone: 'blue' },
      { label: 'Unread', value: String(unread), icon: <Mail size={18} />, tone: 'orange' },
      { label: 'Starred', value: String(starred), icon: <Star size={18} />, tone: 'amber' },
      { label: 'Archived', value: String(archived), icon: <Archive size={18} />, tone: 'gray' },
    ] as const
  }, [messageRows])

  const activityData = useMemo(
    () => [
      { day: 'Mon', received: 12, sent: 6 },
      { day: 'Tue', received: 18, sent: 10 },
      { day: 'Wed', received: 22, sent: 14 },
      { day: 'Thu', received: 16, sent: 9 },
      { day: 'Fri', received: 24, sent: 12 },
      { day: 'Sat', received: 14, sent: 5 },
      { day: 'Sun', received: 10, sent: 4 },
    ],
    []
  )
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
              <div className={`messagesStatIcon messagesStatIcon--${stat.tone}`}>
                {stat.icon}
              </div>
              <div className="messagesStatLabel">{stat.label}</div>
              <div className="messagesStatValue">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="messagesActivity">
          <div className="messagesCardTitle">
            <MessageCircle size={16} />
            Message Activity (This Week)
          </div>
          <div className="messagesChart">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="received" fill="#6366f1" radius={[6, 6, 0, 0]} />
                <Line type="monotone" dataKey="sent" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="messagesChartLegend">
            <div className="messagesLegendItem">
              <span className="messagesLegendDot messagesLegendDot--received" />
              Received
            </div>
            <div className="messagesLegendItem">
              <span className="messagesLegendDot messagesLegendDot--sent" />
              Sent
            </div>
          </div>
        </div>

        <div className="messagesSplit">
          <div className="messagesSidebar">
            <div className="messagesSidebarContent">
              <div className="messagesFolders">
                {FOLDERS.map((folder) => (
                  <button
                    key={folder.key}
                    className={`messagesFolder ${activeFolder === folder.key ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => setActiveFolder(folder.key)}
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
                  <ChevronDown size={14} />
                </label>
              </div>
            </div>
          </div>

          <div className="messagesList">
            <div className="messagesListHeader">
              <div className="messagesListTitle">Inbox</div>
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
            <div className="messagesListBody">
              {filteredMessages.map((message) => (
                <div
                  key={`${message.name}-${message.subject}`}
                  className={`messagesItem ${message.unread ? 'is-unread' : ''}`}
                  onClick={() => {
                    if (message.unread) {
                      updateMessageRead(message.id, true).then(() => refreshMessages())
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
                </div>
              ))}
            </div>
          </div>
        </div>
        {showCompose && (
          <div className="messagesModalOverlay" role="dialog" aria-modal="true">
            <div className="messagesModal">
              <button
                className="messagesModalClose"
                type="button"
                aria-label="Close compose modal"
                onClick={() => setShowCompose(false)}
              >
                <X size={16} />
              </button>
              <h3>Compose Message</h3>
              <label>
                To
                <input
                  type="text"
                  placeholder="e.g., dealer@carflow.ai"
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
              <div className="messagesModalActions">
                <button
                  className="messagesModalBtn"
                  type="button"
                  onClick={() => setShowCompose(false)}
                >
                  Cancel
                </button>
                <button
                  className="messagesModalBtn messagesModalBtn--primary"
                  type="button"
                  onClick={() => {
                    if (!composeSubject.trim() || !composeBody.trim()) return
                    const newMessage: Message = {
                      id: `msg-${Date.now()}`,
                      fromUserId: 'admin_1',
                      toUserId: composeTo || 'carflow_user',
                      subject: composeSubject,
                      body: composeBody,
                      read: false,
                      folder: 'sent',
                      createdAt: new Date().toISOString(),
                    }
                    setMessages((prev) => [newMessage, ...prev])
                    setComposeTo('')
                    setComposeSubject('')
                    setComposeBody('')
                    setShowCompose(false)
                    setActiveFolder('sent')
                  }}
                >
                  Send Message
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
