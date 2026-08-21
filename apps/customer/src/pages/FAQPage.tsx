import { whatsAppLink } from '@carflow/shared'
import {
  Car,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock,
  CreditCard,
  FileText,
  Headphones,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Settings2,
  Shield,
  Truck,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import {
  SUPPORT_EMAIL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_TEL,
} from '../constants/support'
import './FAQPage.css'

type CategoryId =
  | 'all'
  | 'getting-started'
  | 'pricing'
  | 'vehicle'
  | 'insurance'
  | 'subscription'
  | 'delivery'

type FaqItem = {
  id: string
  category: Exclude<CategoryId, 'all'>
  q: string
  a: string
  popular?: boolean
}

const CATEGORIES: {
  id: CategoryId
  label: string
  icon: typeof Car
}[] = [
  { id: 'all', label: 'All Questions', icon: CircleHelp },
  { id: 'getting-started', label: 'Getting Started', icon: Car },
  { id: 'pricing', label: 'Pricing & Payment', icon: CreditCard },
  { id: 'vehicle', label: 'Vehicle & Maintenance', icon: Settings2 },
  { id: 'insurance', label: 'Insurance & Coverage', icon: Shield },
  { id: 'subscription', label: 'Subscription Management', icon: FileText },
  { id: 'delivery', label: 'Delivery & Pickup', icon: Truck },
]

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'how-works',
    category: 'getting-started',
    q: 'How does Carflow work?',
    a: 'Browse cars, open a vehicle, choose duration and start date, then continue to checkout. Sign in when you request — we only ask for an account at that step. After you submit, track everything in My booking.',
    popular: true,
  },
  {
    id: 'whats-included',
    category: 'getting-started',
    q: "What's included in my subscription?",
    a: 'Your plan covers the selected vehicle for the rental period you booked. Exact inclusions (maintenance, insurance extras, mileage) depend on the dealer listing — check the car page and confirmation details before you request.',
    popular: true,
  },
  {
    id: 'how-long',
    category: 'getting-started',
    q: 'How long does it take to get my car?',
    a: 'Once a dealer approves your request, pickup timing is arranged with them. Many handovers happen within a few days of approval, depending on vehicle availability and your start date.',
  },
  {
    id: 'requirements',
    category: 'getting-started',
    q: 'What are the requirements to subscribe?',
    a: 'You need a valid Qatar ID (QID) and driver’s license. Upload them in Account → Verification (or during checkout). You must meet the dealer’s license age and validity rules for the rental period.',
  },
  {
    id: 'how-book',
    category: 'getting-started',
    q: 'How do I book a car?',
    a: 'Browse cars, open a vehicle, pick duration and start date, then continue to checkout to complete your details and documents. You can browse without signing in.',
  },
  {
    id: 'payment',
    category: 'pricing',
    q: 'How does payment work?',
    a: 'Pay at pickup is the default — you pay the dealer when you collect the car. You can optionally pay online with card during checkout before the dealer approves your request.',
    popular: true,
  },
  {
    id: 'pricing-shown',
    category: 'pricing',
    q: 'How is the price calculated?',
    a: 'Pricing is all-inclusive — one monthly fee with no separate tax line. Checkout shows your monthly rate, first month due, and minimum term total before you submit.',
  },
  {
    id: 'cancel',
    category: 'pricing',
    q: 'Can I cancel or change dates?',
    a: 'Message the dealer from My booking (WhatsApp when available) or contact support. Changes depend on dealer approval and where you are in the rental timeline.',
  },
  {
    id: 'maintenance',
    category: 'vehicle',
    q: 'Who handles maintenance and servicing?',
    a: 'Routine service is coordinated with the dealer according to your agreement. Report issues from My booking or Contact so the dealer can arrange support.',
  },
  {
    id: 'swap',
    category: 'vehicle',
    q: 'Can I swap to a different car later?',
    a: 'Vehicle changes are not automatic. Contact the dealer or support to request a change — availability and pricing may differ.',
  },
  {
    id: 'insurance',
    category: 'insurance',
    q: 'Is insurance included?',
    a: 'Coverage details vary by dealer and vehicle. Review the listing and ask support or the dealer before you drive if you need confirmation of excess, roadside assistance, or extras.',
  },
  {
    id: 'accident',
    category: 'insurance',
    q: 'What if I have an accident?',
    a: 'Follow local emergency procedures first, then notify the dealer and Carflow support as soon as it is safe. Keep photos and police reports when required.',
  },
  {
    id: 'track',
    category: 'subscription',
    q: 'Where do I track my booking?',
    a: 'Open My booking in the header. You’ll see a timeline from request sent through approved, active rental, and completed — all in one place.',
    popular: true,
  },
  {
    id: 'documents',
    category: 'subscription',
    q: 'What documents are required?',
    a: 'We need a valid Qatar ID (QID) and driver’s license. Upload them during checkout or in Account → Verification. For pay-at-pickup, the dealer may also verify documents at handover.',
  },
  {
    id: 'extend',
    category: 'subscription',
    q: 'Can I extend my rental?',
    a: 'Yes — ask the dealer from My booking before your end date. Extensions depend on availability and an updated agreement.',
  },
  {
    id: 'pickup',
    category: 'delivery',
    q: 'How does pickup work?',
    a: 'After approval, the dealer confirms a pickup time and location. Bring your QID and license. Pay at pickup applies unless you already paid online.',
  },
  {
    id: 'delivery',
    category: 'delivery',
    q: 'Do you offer delivery?',
    a: 'Some dealers may offer delivery or collection options. Ask in WhatsApp from My booking or Contact support to check what’s available for your vehicle.',
  },
  {
    id: 'support',
    category: 'subscription',
    q: 'Who do I contact for support?',
    a: 'Use the Contact page, email hello@carflow.qa, call +974 4444 4444, or WhatsApp the same number. We typically respond within 24 hours for email.',
  },
]

export function FAQPage() {
  const [category, setCategory] = useState<CategoryId>('getting-started')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>('how-works')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return FAQ_ITEMS.filter((item) => {
      const inCategory = category === 'all' || item.category === category
      if (!inCategory) return false
      if (!q) return true
      return item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
    })
  }, [category, search])

  const popular = FAQ_ITEMS.filter((item) => item.popular)
  const activeCategory = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]
  const ActiveIcon = activeCategory.icon
  const whatsappHref = whatsAppLink(
    SUPPORT_PHONE_TEL,
    'Hi Carflow, I have a question from the FAQ page.'
  )

  const selectPopular = (item: FaqItem) => {
    setCategory(item.category)
    setSearch('')
    setOpenId(item.id)
    window.setTimeout(() => {
      document.getElementById(`faq-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  return (
    <div className="faq-page">
      <Header />

      <section className="faq-hero">
        <div className="faq-hero__inner">
          <h1>Frequently Asked Questions</h1>
          <p>
            Find answers to common questions about Carflow car subscriptions. Can&apos;t find what
            you&apos;re looking for? Contact our support team.
          </p>
          <label className="faq-search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for answers..."
              aria-label="Search FAQs"
            />
          </label>
        </div>
      </section>

      <main className="faq-main">
        <div className="faq-layout">
          <aside className="faq-sidebar">
            <div className="faq-card">
              <h2 className="faq-card__title">
                <span className="faq-card__title-icon" aria-hidden>
                  <CircleHelp size={16} />
                </span>
                Categories
              </h2>
              <nav className="faq-cats" aria-label="FAQ categories">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon
                  const count =
                    cat.id === 'all'
                      ? FAQ_ITEMS.length
                      : FAQ_ITEMS.filter((i) => i.category === cat.id).length
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`faq-cat ${category === cat.id ? 'is-active' : ''}`}
                      onClick={() => {
                        setCategory(cat.id)
                        setOpenId(null)
                      }}
                    >
                      <Icon size={16} aria-hidden />
                      <span>{cat.label}</span>
                      <span className="faq-cat__count">{count}</span>
                    </button>
                  )
                })}
              </nav>
            </div>

            <div className="faq-card">
              <h2 className="faq-card__title">Popular Questions</h2>
              <ul className="faq-popular">
                {popular.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => selectPopular(item)}>
                      {item.q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="faq-card faq-help-mini">
              <h2>Still Need Help?</h2>
              <p>Can&apos;t find the answer you&apos;re looking for? Our support team is here to help.</p>
              <Link to="/contact" className="faq-help-mini__link">
                Contact support →
              </Link>
            </div>
          </aside>

          <div className="faq-content">
            <div className="faq-card faq-accordion-card">
              <div className="faq-section-head">
                <div className="faq-section-head__icon" aria-hidden>
                  <ActiveIcon size={18} />
                </div>
                <div>
                  <h2>{activeCategory.label}</h2>
                  <p>
                    {filtered.length} question{filtered.length === 1 ? '' : 's'}
                    {search.trim() ? ' matching your search' : ''}
                  </p>
                </div>
              </div>

              {filtered.length === 0 ? (
                <p className="faq-empty">No questions match your search. Try another keyword or category.</p>
              ) : (
                <div className="faq-list">
                  {filtered.map((item) => {
                    const open = openId === item.id
                    return (
                      <div
                        key={item.id}
                        id={`faq-${item.id}`}
                        className={`faq-item ${open ? 'is-open' : ''}`}
                      >
                        <button
                          type="button"
                          className="faq-question"
                          aria-expanded={open}
                          onClick={() => setOpenId(open ? null : item.id)}
                        >
                          <span>{item.q}</span>
                          <ChevronDown size={18} className="faq-chevron" aria-hidden />
                        </button>
                        {open && <div className="faq-answer">{item.a}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <section className="faq-support">
              <h2>Still have questions?</h2>
              <p>
                Our customer support team is available 24/7 to help you with any questions about your
                Carflow subscription.
              </p>
              <div className="faq-support__actions">
                <a className="faq-support__btn faq-support__btn--primary" href={`tel:${SUPPORT_PHONE_TEL}`}>
                  <Phone size={16} aria-hidden />
                  {SUPPORT_PHONE_DISPLAY}
                </a>
                <a className="faq-support__btn" href={`mailto:${SUPPORT_EMAIL}`}>
                  <Mail size={16} aria-hidden />
                  Email Support
                </a>
                <a
                  className="faq-support__btn"
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={16} aria-hidden />
                  Live Chat
                </a>
              </div>
              <div className="faq-support__meta">
                <span>
                  <Clock size={14} aria-hidden />
                  24/7 Support
                </span>
                <span>
                  <CheckCircle2 size={14} aria-hidden />
                  Average Response: 2 minutes
                </span>
                <span>
                  <Headphones size={14} aria-hidden />
                  <Link to="/contact">Contact page</Link>
                </span>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
