import { X } from 'lucide-react'
import './InfoModal.css'

type InfoModalProps = {
  open: boolean
  title: string
  message: string
  onClose: () => void
}

export function InfoModal({ open, title, message, onClose }: InfoModalProps) {
  if (!open) return null

  return (
    <div className="customerInfoModalOverlay" role="dialog" aria-modal="true">
      <div className="customerInfoModal">
        <button className="customerInfoModalClose" type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <h3 className="customerInfoModalTitle">{title}</h3>
        <p className="customerInfoModalMessage">{message}</p>
        <div className="customerInfoModalActions">
          <button className="customerInfoModalBtn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
