import { CarflowLogo } from '@carflow/shared'
import { Facebook, Instagram, Linkedin, Youtube } from 'lucide-react'
import { Link } from 'react-router-dom'
import './Footer.css'

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-logo">
            <img src={CarflowLogo} alt="Carflow" />
          </div>

          <nav className="footer-nav">
            <Link to="/browse" className="footer-link">
              Browse
            </Link>
            <Link to="/faqs" className="footer-link">
              FAQ
            </Link>
            <Link to="/contact" className="footer-link">
              Contact
            </Link>
            <a
              href="mailto:dealers@carflow.ai?subject=Dealer%20Application"
              className="footer-link"
            >
              List your cars
            </a>
          </nav>

          <div className="social-links">
            <a href="https://www.linkedin.com" className="social-link" aria-label="LinkedIn" target="_blank" rel="noreferrer">
              <Linkedin size={20} />
            </a>
            <a href="https://www.facebook.com" className="social-link" aria-label="Facebook" target="_blank" rel="noreferrer">
              <Facebook size={20} />
            </a>
            <a href="https://www.instagram.com" className="social-link" aria-label="Instagram" target="_blank" rel="noreferrer">
              <Instagram size={20} />
            </a>
            <a href="https://www.youtube.com" className="social-link" aria-label="YouTube" target="_blank" rel="noreferrer">
              <Youtube size={20} />
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-divider"></div>
          <div className="footer-legal">
            <span className="footer-link footer-link--muted">Terms & privacy — contact us for details</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
