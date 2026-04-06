import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { Mail, MessageCircle, MapPin } from 'lucide-react'
import './ContactPage.css'

export function ContactPage() {
  return (
    <div className="contact-page">
      <Header />
      <main className="contact-main">
        <h1>Contact Us</h1>
        <p className="contact-intro">
          Have a question or need help? Reach out to the Carflow team.
        </p>
        <div className="contact-cards">
          <div className="contact-card">
            <Mail size={24} />
            <h3>Email</h3>
            <a href="mailto:support@carflow.ai">support@carflow.ai</a>
          </div>
          <div className="contact-card">
            <MessageCircle size={24} />
            <h3>Support</h3>
            <p>We typically respond within 24 hours.</p>
          </div>
          <div className="contact-card">
            <MapPin size={24} />
            <h3>Location</h3>
            <p>Carflow HQ</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
