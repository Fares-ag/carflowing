import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Footer } from '../components/shared/Footer'
import { Header } from '../components/shared/Header'
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_ROUTES,
  type LegalDocument,
  type LegalDocumentKind,
} from '../constants/legal'
import { SUPPORT_EMAIL } from '../constants/support'
import './LegalPages.css'

const OTHER_DOCUMENT_ORDER: LegalDocumentKind[] = [
  'terms',
  'privacy',
  'refund_policy',
  'rental_agreement',
]

function LegalDocumentPage({ doc }: { doc: LegalDocument }) {
  const others = OTHER_DOCUMENT_ORDER.filter((kind) => kind !== doc.kind)
  const anyPlaceholder = doc.sections.some((section) => section.placeholder)

  return (
    <div className="legal-page">
      <Header />

      <main className="legal-main">
        <header className="legal-hero">
          <span className="legal-pill">Legal</span>
          <h1>{doc.title}</h1>
          <p>{doc.summary}</p>
          <p className="legal-hero__version">Document version {LEGAL_DOCUMENT_VERSION}</p>
        </header>

        {anyPlaceholder && (
          <div className="legal-notice" role="status">
            <AlertTriangle size={18} aria-hidden />
            <p>
              This document is a structural draft. The headings are final; every body paragraph is
              still a placeholder awaiting legal review and none of it is binding. Questions in the
              meantime: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </p>
          </div>
        )}

        <article className="legal-body">
          <nav className="legal-toc" aria-label="Contents">
            <h2>Contents</h2>
            <ol>
              {doc.sections.map((section, index) => (
                <li key={section.heading}>
                  <a href={`#${sectionId(doc.kind, index)}`}>{section.heading}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="legal-sections">
            {doc.sections.map((section, index) => (
              <section
                key={section.heading}
                id={sectionId(doc.kind, index)}
                className="legal-section"
              >
                <h2>
                  <span className="legal-section__number">{index + 1}.</span> {section.heading}
                </h2>
                {section.placeholder ? (
                  <div className="legal-placeholder">
                    <p className="legal-placeholder__tag">PLACEHOLDER — pending legal review</p>
                    <p className="legal-placeholder__body">{section.body}</p>
                  </div>
                ) : (
                  <p className="legal-section__body">{section.body}</p>
                )}
              </section>
            ))}
          </div>
        </article>

        <nav className="legal-related" aria-label="Other legal documents">
          <h2>Related documents</h2>
          <ul>
            {others.map((kind) => (
              <li key={kind}>
                <Link to={LEGAL_ROUTES[kind]}>{LEGAL_DOCUMENTS[kind].title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>

      <Footer />
    </div>
  )
}

function sectionId(kind: LegalDocumentKind, index: number): string {
  return `${kind.replace(/_/g, '-')}-${index + 1}`
}

export function TermsPage() {
  return <LegalDocumentPage doc={LEGAL_DOCUMENTS.terms} />
}

export function PrivacyPage() {
  return <LegalDocumentPage doc={LEGAL_DOCUMENTS.privacy} />
}

export function RefundPolicyPage() {
  return <LegalDocumentPage doc={LEGAL_DOCUMENTS.refund_policy} />
}

export function RentalAgreementPage() {
  return <LegalDocumentPage doc={LEGAL_DOCUMENTS.rental_agreement} />
}
