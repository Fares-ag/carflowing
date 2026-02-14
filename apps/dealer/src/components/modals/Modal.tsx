import { memo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import clsx from 'clsx'
import './Modal.css'

type ModalSize = 'sm' | 'md' | 'lg'

export interface ModalProps {
  title: string
  description?: string
  size: ModalSize
  onClose: () => void
  children: React.ReactNode
}

export const Modal = memo(function Modal({ title, description, size, onClose, children }: ModalProps) {
  const modalDescription = description ?? 'Dialog content'
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modalOverlay" />
        <Dialog.Content
          className="modalDialog"
          style={{
            width: size === 'sm' ? 446 : size === 'md' ? 896 : 1006,
            maxWidth: '100%',
          }}
        >
          <Dialog.Title className="modalVisuallyHidden">{title}</Dialog.Title>
          <Dialog.Description className="modalVisuallyHidden">{modalDescription}</Dialog.Description>
          <Dialog.Close asChild>
            <button className={clsx('modalCloseBtn')} type="button" aria-label="Close">
              ✕
            </button>
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})

