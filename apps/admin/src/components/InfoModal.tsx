import { X } from 'lucide-react'
import './InfoModal.css'

type InfoModalProps = {
  open: boolean
  title: string
  message: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
}

export function InfoModal({ open, title, message, onClose, onConfirm, confirmLabel }: InfoModalProps) {
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
          {onConfirm ? (
            <button className="adminInfoModalBtn adminInfoModalBtn--danger" type="button" onClick={onConfirm}>
              {confirmLabel ?? 'Confirm'}
            </button>
          ) : null}
          <button className="adminInfoModalBtn" type="button" onClick={onClose}>
            {onConfirm ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
