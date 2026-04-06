import { ArrowUpCircle } from 'lucide-react'
import './ProcessingOverlay.css'

export function ProcessingOverlay() {
  return (
    <div className="processing-overlay" role="status" aria-live="polite">
      <div className="processing-overlay__card">
        <div className="processing-overlay__icon">
          <ArrowUpCircle size={40} />
        </div>
        <p className="processing-overlay__text">Processing your request...</p>
        <div className="processing-overlay__spinner" />
      </div>
    </div>
  )
}
