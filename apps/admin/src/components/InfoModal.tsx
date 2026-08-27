import { X } from 'lucide-react'
import { useId } from 'react'
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
  // A role="dialog" with no accessible name is announced as an unnamed dialog by
  // screen readers, and cannot be targeted by name in tests. Label it by its heading.
  const titleId = useId()
  const messageId = useId()

  if (!open) return null

  return (
    <div
      className="adminInfoModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
    >
      <div className="adminInfoModal">
        <button className="adminInfoModalClose" type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <h3 className="adminInfoModalTitle" id={titleId}>
          {title}
        </h3>
        <p className="adminInfoModalMessage" id={messageId}>
          {message}
        </p>
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
