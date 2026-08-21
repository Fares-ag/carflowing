import { ArrowRight, CarFront, CircleCheck, CreditCard, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import './HowItWorksPage.css'

const STEPS = [
  {
    step: '01',
    title: 'Choose your car',
    description:
      'Browse our fleet and select the perfect car for your needs. Filter by brand, type, or budget.',
    icon: Search,
  },
  {
    step: '02',
    title: 'Request online',
    description:
      'Pick duration and start date, then complete checkout with your details and documents — pay at pickup or online.',
    icon: CreditCard,
  },
  {
    step: '03',
    title: 'Get approved',
    description:
      'Track status in My booking. When the dealer approves, arrange pickup — usually within a few days of approval.',
    icon: CarFront,
  },
  {
    step: '04',
    title: 'Drive & enjoy',
    description:
      'Enjoy your rental with clear dates, dealer contact, and support whenever you need it.',
    icon: CircleCheck,
  },
]

export function HowItWorksPage() {
  return (
    <div className="hiw-page">
      <Header />

      <main className="hiw-main">
        <section className="hiw-hero" aria-labelledby="hiw-heading">
          <div className="hiw-hero__inner">
            <span className="hiw-pill">Simple process</span>
            <h1 id="hiw-heading">How it works</h1>
            <p>
              Getting your dream car has never been easier. Follow these simple steps and you&apos;ll
              be driving in no time.
            </p>
          </div>
        </section>

        <section className="hiw-steps" aria-label="Booking steps">
          <div className="hiw-steps__inner">
            <div className="hiw-grid">
              {STEPS.map((item, index) => {
                const Icon = item.icon
                return (
                  <article key={item.step} className="hiw-card">
                    {index < STEPS.length - 1 && (
                      <span className="hiw-card__connector" aria-hidden />
                    )}
                    <span className="hiw-card__step">{item.step}</span>
                    <div className="hiw-card__icon" aria-hidden>
                      <Icon size={28} strokeWidth={1.75} />
                    </div>
                    <h2>{item.title}</h2>
                    <p>{item.description}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="hiw-cta">
          <div className="hiw-cta__inner">
            <h2>Ready to get started?</h2>
            <p>Browse available cars and send your first request in a few minutes.</p>
            <div className="hiw-cta__actions">
              <Link to="/browse" className="hiw-cta__btn hiw-cta__btn--primary">
                Browse cars
                <ArrowRight size={16} aria-hidden />
              </Link>
              <Link to="/faqs" className="hiw-cta__btn hiw-cta__btn--ghost">
                Read FAQs
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
