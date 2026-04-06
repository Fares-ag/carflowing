import { useState } from 'react'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { ChevronDown } from 'lucide-react'
import './FAQPage.css'

const FAQ_ITEMS = [
  {
    q: 'How do I book a car?',
    a: 'Browse cars, choose your dates and options, add to cart, and complete checkout. You’ll need to sign in and upload your QID and driver’s license before confirming.',
  },
  {
    q: 'What documents are required?',
    a: 'We need a valid Qatar ID (QID) and driver’s license. You can upload these during checkout.',
  },
  {
    q: 'Can I cancel or modify my booking?',
    a: 'Go to My Requests in your account to see the status of your booking. Contact support for changes or cancellations.',
  },
  {
    q: 'How does payment work?',
    a: 'Payment is collected at the dealership when you pick up your vehicle. We accept cash, credit/debit cards, and bank transfers.',
  },
  {
    q: 'Who do I contact for support?',
    a: 'Email support@carflow.ai or use the Contact page. We typically respond within 24 hours.',
  },
]

export function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div className="faq-page">
      <Header />
      <main className="faq-main">
        <h1>Frequently Asked Questions</h1>
        <p className="faq-intro">Quick answers to common questions about Carflow.</p>
        <div className="faq-list">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className={`faq-item ${openIndex === i ? 'open' : ''}`}
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
            >
              <div className="faq-question">
                <span>{item.q}</span>
                <ChevronDown size={20} className="faq-chevron" />
              </div>
              {openIndex === i && <div className="faq-answer">{item.a}</div>}
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  )
}
