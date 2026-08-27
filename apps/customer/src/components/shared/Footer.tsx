import { CarflowLogo } from '@carflow/shared'
import type { LucideIcon } from 'lucide-react'
import { Facebook, Instagram, Linkedin, Youtube } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LEGAL_DOCUMENTS, LEGAL_ROUTES, type LegalDocumentKind } from '../../constants/legal'
import { SOCIAL_LINKS, type SocialNetwork } from '../../constants/social'
import { DEALER_SIGNUP_HREF, DEALER_SIGNUP_IS_EXTERNAL } from '../../constants/support'
import './Footer.css'

const SOCIAL_ICONS: Record<SocialNetwork, LucideIcon> = {
  linkedin: Linkedin,
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
}

const LEGAL_LINK_ORDER: LegalDocumentKind[] = ['terms', 'privacy', 'refund_policy', 'rental_agreement']

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
              href={DEALER_SIGNUP_HREF}
              className="footer-link"
              {...(DEALER_SIGNUP_IS_EXTERNAL ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              List your cars
            </a>
          </nav>

          {SOCIAL_LINKS.length > 0 && (
            <div className="social-links">
              {SOCIAL_LINKS.map((link) => {
                const Icon = SOCIAL_ICONS[link.network]
                return (
                  <a
                    key={link.network}
                    href={link.url}
                    className="social-link"
                    aria-label={link.label}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon size={20} />
                  </a>
                )
              })}
            </div>
          )}
        </div>

        <div className="footer-bottom">
          <div className="footer-divider"></div>
          <nav className="footer-legal" aria-label="Legal">
            {LEGAL_LINK_ORDER.map((kind) => (
              <Link key={kind} to={LEGAL_ROUTES[kind]} className="footer-link">
                {LEGAL_DOCUMENTS[kind].title}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}
