import type { MessageFolder } from '@carflow/shared'

import { formatDate } from '@carflow/shared'

import { Archive, ArrowLeft, Inbox, Loader2, Mail, Send, Star } from 'lucide-react'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { Link } from 'react-router-dom'

import { Footer } from '../components/shared/Footer'

import { Header } from '../components/shared/Header'

import { toast } from '../hooks/useToast'

import { t } from '../i18n'

import {

  getMessageThread,

  listMessageThreads,

  listMessages,

  markMessageRead,

  moveMessageToFolder,

  sendMessage,

  type CustomerMessage,

  type MessageThreadSummary,

} from '../services/customerService'

import './MessagesPage.css'



const FOLDERS: { id: MessageFolder; labelKey: string; icon: typeof Inbox }[] = [

  { id: 'inbox', labelKey: 'messages.inbox', icon: Inbox },

  { id: 'sent', labelKey: 'messages.sent', icon: Send },

  { id: 'starred', labelKey: 'messages.starred', icon: Star },

  { id: 'archived', labelKey: 'messages.archived', icon: Archive },

]



function formatTimeAgo(dateStr: string): string {

  const date = new Date(dateStr)

  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)

  if (diffMin < 1) return t('messages.justNow')

  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)

  if (diffHr < 24) return `${diffHr}h ago`

  const diffDays = Math.floor(diffHr / 24)

  if (diffDays < 7) return `${diffDays}d ago`

  return formatDate(date)

}



export function MessagesPage() {

  const [view, setView] = useState<'threads' | 'folder'>('threads')

  const [folder, setFolder] = useState<MessageFolder>('inbox')

  const [threads, setThreads] = useState<MessageThreadSummary[]>([])

  const [folderItems, setFolderItems] = useState<CustomerMessage[]>([])

  const [activeSubject, setActiveSubject] = useState<string | null>(null)

  const [threadMessages, setThreadMessages] = useState<CustomerMessage[]>([])

  const [loading, setLoading] = useState(true)

  const [loadingThread, setLoadingThread] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const [replyBody, setReplyBody] = useState('')

  const [sending, setSending] = useState(false)



  const refreshThreads = useCallback(async () => {

    setLoading(true)

    setError(null)

    try {

      setThreads(await listMessageThreads())

    } catch (err) {

      setError(err instanceof Error ? err.message : t('messages.loadError'))

      setThreads([])

    } finally {

      setLoading(false)

    }

  }, [])



  const loadFolder = useCallback(async () => {

    setLoading(true)

    setError(null)

    try {

      const data = await listMessages({ folder, pageSize: 50 })

      setFolderItems(data.items)

    } catch (err) {

      setError(err instanceof Error ? err.message : t('messages.loadError'))

      setFolderItems([])

    } finally {

      setLoading(false)

    }

  }, [folder])



  const loadThread = useCallback(async (subject: string) => {

    setLoadingThread(true)

    try {

      const items = await getMessageThread(subject)

      setThreadMessages(items)

      await Promise.all(

        items

          .filter((message) => !message.read && message.folder === 'inbox')

          .map((message) => markMessageRead(message.id, true).catch(() => undefined))

      )

      if (view === 'threads') void refreshThreads()

    } catch (err) {

      toast.error(err instanceof Error ? err.message : t('messages.loadError'))

      setThreadMessages([])

    } finally {

      setLoadingThread(false)

    }

  }, [refreshThreads, view])



  useEffect(() => {

    if (view === 'threads') void refreshThreads()

    else void loadFolder()

  }, [view, refreshThreads, loadFolder])



  useEffect(() => {

    if (activeSubject) void loadThread(activeSubject)

    else setThreadMessages([])

  }, [activeSubject, loadThread])



  const activeThread = useMemo(

    () => threads.find((thread) => thread.threadSubject === activeSubject) ?? null,

    [threads, activeSubject]

  )



  const resolveRecipientId = (): string | null => {

    if (!threadMessages.length) return null

    const inbound = threadMessages.find((message) => message.folder === 'inbox')

    if (inbound) return inbound.fromUserId

    const outbound = threadMessages.find((message) => message.folder === 'sent')

    return outbound?.toUserId ?? null

  }



  const handleReply = async () => {

    const body = replyBody.trim()

    if (!body || !activeSubject) return

    const toUserId = resolveRecipientId()

    if (!toUserId) {

      toast.error(t('messages.replyError'))

      return

    }



    setSending(true)

    try {

      await sendMessage({

        toUserId,

        body,

        replyToMessageId: threadMessages[threadMessages.length - 1]?.id,

      })

      setReplyBody('')

      await loadThread(activeSubject)

      toast.success(t('messages.sentToast'))

    } catch (err) {

      toast.error(err instanceof Error ? err.message : t('messages.replyError'))

    } finally {

      setSending(false)

    }

  }



  const handleRead = async (id: string) => {

    try {

      await markMessageRead(id, true)

      setFolderItems((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)))

    } catch (err) {

      toast.error(err instanceof Error ? err.message : t('messages.markReadError'))

    }

  }



  const handleFolder = async (id: string, next: MessageFolder) => {

    try {

      await moveMessageToFolder(id, next)

      setFolderItems((prev) => prev.filter((m) => m.id !== id))

      toast.success(t('messages.moved'))

    } catch (err) {

      toast.error(err instanceof Error ? err.message : t('messages.moveError'))

    }

  }



  return (

    <div className="customer-messages-page">

      <Header />

      <main className="customer-messages-main">

        <Link to="/my-booking" className="customer-messages-back">

          <ArrowLeft size={14} />

          {t('nav.myBooking')}

        </Link>



        <div className="customer-messages-header">

          <h1>{t('messages.title')}</h1>

          <p>{t('messages.subtitle')}</p>

        </div>



        <div className="customer-messages-view-tabs" role="tablist">

          <button

            type="button"

            role="tab"

            aria-selected={view === 'threads'}

            className={view === 'threads' ? 'active' : ''}

            onClick={() => {

              setView('threads')

              setActiveSubject(null)

            }}

          >

            {t('messages.conversations')}

          </button>

          <button

            type="button"

            role="tab"

            aria-selected={view === 'folder'}

            className={view === 'folder' ? 'active' : ''}

            onClick={() => {

              setView('folder')

              setActiveSubject(null)

            }}

          >

            {t('messages.byFolder')}

          </button>

        </div>



        {view === 'folder' ? (

          <div className="customer-messages-folders" role="tablist">

            {FOLDERS.map(({ id, labelKey, icon: Icon }) => (

              <button

                key={id}

                type="button"

                role="tab"

                aria-selected={folder === id}

                className={`customer-messages-folder ${folder === id ? 'active' : ''}`}

                onClick={() => setFolder(id)}

              >

                <Icon size={14} style={{ verticalAlign: -2, marginRight: 4 }} />

                {t(labelKey)}

              </button>

            ))}

          </div>

        ) : null}



        {loading ? (

          <div className="customer-messages-state">{t('messages.loading')}</div>

        ) : error ? (

          <div className="customer-messages-state customer-messages-state--error">{error}</div>

        ) : view === 'threads' ? (

          <div className="customer-messages-layout">

            <aside className="customer-messages-thread-list-panel">

              {threads.length === 0 ? (

                <div className="customer-messages-empty">

                  <Mail size={32} />

                  <p>{t('messages.empty')}</p>

                </div>

              ) : (

                <ul className="customer-messages-thread-list">

                  {threads.map((thread) => (

                    <li key={thread.threadSubject}>

                      <button

                        type="button"

                        className={`customer-messages-thread-btn ${activeSubject === thread.threadSubject ? 'active' : ''}`}

                        onClick={() => setActiveSubject(thread.threadSubject)}

                      >

                        <div className="customer-messages-thread-btn-top">

                          <strong>{thread.participantName ?? thread.participantEmail ?? t('messages.dealer')}</strong>

                          {thread.unreadCount > 0 ? (

                            <span className="customer-messages-unread">{thread.unreadCount}</span>

                          ) : null}

                        </div>

                        <span>{thread.displaySubject}</span>

                        <small>{formatTimeAgo(thread.lastMessage.createdAt)}</small>

                      </button>

                    </li>

                  ))}

                </ul>

              )}

            </aside>



            <section className="customer-messages-thread-panel">

              {!activeSubject ? (

                <div className="customer-messages-state">{t('messages.selectConversation')}</div>

              ) : (

                <>

                  <div className="customer-messages-thread-header">

                    <h2>{activeThread?.displaySubject ?? t('messages.conversations')}</h2>

                    <p>{activeThread?.participantName ?? activeThread?.participantEmail}</p>

                  </div>

                  <div className="customer-messages-thread-messages">

                    {loadingThread ? (

                      <Loader2 className="customer-messages-spinner" size={24} />

                    ) : (

                      threadMessages.map((message) => (

                        <div

                          key={message.id}

                          className={`customer-messages-bubble ${message.folder === 'sent' ? 'is-sent' : 'is-received'}`}

                        >

                          <div className="customer-messages-bubble-meta">

                            <span>

                              {message.folder === 'sent'

                                ? t('messages.you')

                                : message.fromName || message.fromEmail || t('messages.dealer')}

                            </span>

                            <time dateTime={message.createdAt}>{formatTimeAgo(message.createdAt)}</time>

                          </div>

                          <p>{message.body}</p>

                        </div>

                      ))

                    )}

                  </div>

                  <div className="customer-messages-compose">

                    <textarea

                      value={replyBody}

                      onChange={(e) => setReplyBody(e.target.value)}

                      placeholder={t('messages.replyPlaceholder')}

                      rows={3}

                    />

                    <button type="button" disabled={sending || !replyBody.trim()} onClick={() => void handleReply()}>

                      <Send size={14} />

                      {sending ? t('messages.sending') : t('messages.send')}

                    </button>

                  </div>

                </>

              )}

            </section>

          </div>

        ) : folderItems.length === 0 ? (

          <div className="customer-messages-empty">

            <Mail size={32} />

            <p>{t('messages.empty')}</p>

          </div>

        ) : (

          <ul className="customer-messages-list">

            {folderItems.map((message) => (

              <li

                key={message.id}

                className={`customer-messages-item ${message.read ? '' : 'customer-messages-item--unread'}`}

              >

                <div className="customer-messages-item-top">

                  <strong>{message.subject}</strong>

                  <time dateTime={message.createdAt}>{formatTimeAgo(message.createdAt)}</time>

                </div>

                {message.fromName || message.fromEmail ? (

                  <p className="customer-messages-from">

                    {t('messages.from')}: {message.fromName || message.fromEmail}

                  </p>

                ) : null}

                <p className="customer-messages-body">{message.body}</p>

                <div className="customer-messages-actions">

                  {!message.read ? (

                    <button

                      type="button"

                      className="customer-messages-action"

                      onClick={() => handleRead(message.id)}

                    >

                      {t('messages.markRead')}

                    </button>

                  ) : null}

                  <button

                    type="button"

                    className="customer-messages-action"

                    onClick={() => {

                      setView('threads')

                      setActiveSubject(message.subject)

                    }}

                  >

                    {t('messages.reply')}

                  </button>

                  {folder !== 'starred' ? (

                    <button

                      type="button"

                      className="customer-messages-action"

                      onClick={() => handleFolder(message.id, 'starred')}

                    >

                      {t('messages.star')}

                    </button>

                  ) : null}

                  {folder !== 'archived' ? (

                    <button

                      type="button"

                      className="customer-messages-action"

                      onClick={() => handleFolder(message.id, 'archived')}

                    >

                      {t('messages.archive')}

                    </button>

                  ) : folder === 'archived' ? (

                    <button

                      type="button"

                      className="customer-messages-action"

                      onClick={() => handleFolder(message.id, 'inbox')}

                    >

                      {t('messages.moveToInbox')}

                    </button>

                  ) : null}

                </div>

              </li>

            ))}

          </ul>

        )}

      </main>

      <Footer />

    </div>

  )

}


