import { Link } from 'react-router-dom'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import './NotFoundPage.css'

export function NotFoundPage() {
  return (
    <div className="not-found-page">
      <Header />
      <main className="not-found-main">
        <h1>Page not found</h1>
        <p>This link may be outdated. Booking now happens on each car&apos;s page.</p>
        <Link to="/browse" className="not-found-cta">
          Browse cars
        </Link>
      </main>
      <Footer />
    </div>
  )

}
