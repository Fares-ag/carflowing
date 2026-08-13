import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  Headphones,
  Mail,
  MessageCircle,
  Phone,
  Send,
  Shield,
  UserRound,
} from 'lucide-react'
import { whatsAppLink } from '@carflow/shared'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { useAuth } from '../contexts/AuthContext'
import { submitComplaint } from '../services/customerService'
import { toast } from '../hooks/useToast'
import {
  SUPPORT_EMAIL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_TEL,
} from '../constants/support'
import './ContactPage.css'

const SUPPORT_FEATURES = [
  {
    title: '24/7 Customer Support',
    text: 'Round-the-clock assistance for all your needs',
    icon: Headphones,
    tone: 'purple' as const,
  },
  {
    title: 'Roadside Assistance',
    text: 'Emergency support wherever you are in Qatar',
    icon: Shield,
    tone: 'green' as const,
  },
  {
    title: 'Personal Account Manager',
    text: 'Dedicated support for Premium & Luxury subscribers',
    icon: UserRound,
    tone: 'blue' as const,
  },
  {
    title: 'Flexible Scheduling',
    text: 'Book service appointments at your convenience',
    icon: Calendar,
    tone: 'orange' as const,
  },
]

export function ContactPage() {
  const { session } = useAuth()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!session) return
    setFullName((n) => n || session.name || '')
    setEmail((e) => e || session.email || '')
  }, [session?.userId, session?.name, session?.email])

  const whatsappHref = whatsAppLink(
    SUPPORT_PHONE_TEL,
    'Hi Carflow, I have a question about car subscriptions.'
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!fullName.trim() || !phone.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      toast.error('Please complete all required fields.')
      return
    }

    if (!session) {
      const body = [
        `Name: ${fullName.trim()}`,
        `Phone: ${phone.trim()}`,
        `Email: ${email.trim()}`,
        '',
        message.trim(),
      ].join('\n')
      window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(body)}`
      return
    }

    setSubmitting(true)
    try {
      await submitComplaint({
        category: 'general',
        subject: subject.trim(),
        description: [
          `Name: ${fullName.trim()}`,
          `Phone: ${phone.trim()}`,
          `Email: ${email.trim()}`,
          '',
          message.trim(),
        ].join('\n'),
        priority: 'medium',
      })
      toast.success("Your message was sent. We'll get back to you within 24 hours.")
      setSubject('')
      setMessage('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to send message.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="contact-page">
      <Header />
      <main className="contact-main">
        <header className="contact-hero">
          <span className="contact-pill">Contact Us</span>
          <h1>Get in touch with our team.</h1>
          <p>
            Ready to start your car subscription journey? Our experts are here to help you find the
            perfect vehicle and plan for your needs.
          </p>
        </header>

        <section className="contact-methods" aria-label="Contact methods">
          <article className="contact-method">
            <div className="contact-method__icon" aria-hidden>
              <Phone size={20} />
            </div>
            <h2>Call Us</h2>
            <p className="contact-method__desc">Speak with our experts</p>
            <a className="contact-method__action" href={`tel:${SUPPORT_PHONE_TEL}`}>
              {SUPPORT_PHONE_DISPLAY}
            </a>
            <p className="contact-method__meta">24/7 Available</p>
          </article>

          <article className="contact-method">
            <div className="contact-method__icon" aria-hidden>
              <MessageCircle size={20} />
            </div>
            <h2>WhatsApp</h2>
            <p className="contact-method__desc">Quick support via chat</p>
            <a
              className="contact-method__action"
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
            >
              {SUPPORT_PHONE_DISPLAY}
            </a>
            <p className="contact-method__meta">Mon–Sat, 8AM–10PM</p>
          </article>

          <article className="contact-method">
            <div className="contact-method__icon" aria-hidden>
              <Mail size={20} />
            </div>
            <h2>Email</h2>
            <p className="contact-method__desc">Send us your inquiry</p>
            <a className="contact-method__action" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            <p className="contact-method__meta">Response within 24hrs</p>
          </article>
        </section>

        <section className="contact-grid">
          <div className="contact-panel contact-form-panel">
            <div className="contact-panel__head">
              <Send size={18} className="contact-panel__head-icon" aria-hidden />
              <div>
                <h2>Send us a message</h2>
                <p>Fill out the form below and we&apos;ll get back to you within 24 hours.</p>
              </div>
            </div>

            <form className="contact-form" onSubmit={handleSubmit} noValidate>
              <div className="contact-form__row">
                <label className="contact-field">
                  <span>
                    Full Name <em>*</em>
                  </span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    required
                  />
                </label>
                <label className="contact-field">
                  <span>
                    Phone Number <em>*</em>
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+974 XXXX XXXX"
                    autoComplete="tel"
                    required
                  />
                </label>
              </div>

              <label className="contact-field">
                <span>
                  Email Address <em>*</em>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="contact-field">
                <span>
                  Subject <em>*</em>
                </span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What's this regarding?"
                  maxLength={200}
                  required
                />
              </label>

              <label className="contact-field">
                <span>
                  Message <em>*</em>
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us more about your inquiry..."
                  rows={5}
                  required
                />
              </label>

              {!session && (
                <p className="contact-form__hint">
                  Guests can send via email. <Link to="/login?redirect=%2Fcontact">Sign in</Link> to
                  track support requests in your account.
                </p>
              )}

              <button type="submit" className="contact-submit" disabled={submitting}>
                <Send size={16} aria-hidden />
                {submitting ? 'Sending…' : 'Send Message'}
              </button>
            </form>
          </div>

          <aside className="contact-panel contact-why">
            <h2>Why Choose Carflow Support?</h2>
            <ul className="contact-why__list">
              {SUPPORT_FEATURES.map((feature) => {
                const Icon = feature.icon
                return (
                  <li key={feature.title} className="contact-why__item">
                    <div className={`contact-why__icon contact-why__icon--${feature.tone}`} aria-hidden>
                      <Icon size={18} />
                    </div>
                    <div>
                      <h3>{feature.title}</h3>
                      <p>{feature.text}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </aside>
        </section>

        <section className="contact-cta">
          <h2>Ready to get started?</h2>
          <p>
            Join thousands of satisfied customers who have made the smart choice with Carflow. Get
            your personalized quote today.
          </p>
          <div className="contact-cta__actions">
            <a className="contact-cta__btn contact-cta__btn--primary" href={`tel:${SUPPORT_PHONE_TEL}`}>
              <Phone size={16} aria-hidden />
              Call {SUPPORT_PHONE_DISPLAY}
            </a>
            <Link to="/browse" className="contact-cta__btn contact-cta__btn--ghost">
              <Calendar size={16} aria-hidden />
              Schedule Consultation
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
