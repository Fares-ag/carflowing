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
    <div className="adminInfoModalOverlay" role="dialog" aria-modal="true">
      <div className="adminInfoModal">
        <button className="adminInfoModalClose" type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <h3 className="adminInfoModalTitle">{title}</h3>
        <p className="adminInfoModalMessage">{message}</p>
        <div className="adminInfoModalActions">
          <button className="adminInfoModalBtn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
