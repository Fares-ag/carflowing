import { CarflowLogo } from '@carflow/shared'
import { Facebook, Instagram, Linkedin, Youtube } from 'lucide-react'
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
            <a href="/browse" className="footer-link">Browse Cars</a>
            <a href="/dealer" className="footer-link">Become a Dealer</a>
            <a href="/contact" className="footer-link">Contact Us</a>
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
            <a href="/terms" className="footer-link">Terms</a>
            <a href="/privacy" className="footer-link">Privacy and Policy</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

