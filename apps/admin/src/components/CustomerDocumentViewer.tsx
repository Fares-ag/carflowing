import { apiFetchBlob } from '@carflow/shared'
import { FileText, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import './CustomerDocumentViewer.css'

type CustomerDocumentViewerProps = {
  open: boolean
  path: string | null | undefined
  label: string
  onClose: () => void
}

export function CustomerDocumentViewer({ open, path, label, onClose }: CustomerDocumentViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [contentType, setContentType] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !path) {
      setBlobUrl(null)
      setContentType(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    setLoading(true)
    setError(null)
    setBlobUrl(null)
    setContentType(null)

    apiFetchBlob('/uploads/documents/file', { params: { path } })
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setContentType(blob.type || null)
        setBlobUrl(objectUrl)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load document')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, path])

  useEffect(() => {
    if (!open && blobUrl) {
      URL.revokeObjectURL(blobUrl)
      setBlobUrl(null)
    }
  }, [open, blobUrl])

  if (!open) return null

  const isPdf = contentType === 'application/pdf' || path?.toLowerCase().endsWith('.pdf')
  const isImage = contentType?.startsWith('image/') ?? /\.(png|jpe?g|webp|gif)$/i.test(path ?? '')

  return (
    <div className="customerDocViewerOverlay" role="dialog" aria-modal="true" aria-labelledby="customer-doc-title">
      <div className="customerDocViewerModal">
        <div className="customerDocViewerHeader">
          <h3 id="customer-doc-title" className="customerDocViewerTitle">
            <FileText size={18} />
            {label}
          </h3>
          <button className="customerDocViewerClose" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="customerDocViewerBody">
          {!path ? (
            <p className="customerDocViewerEmpty">No document on file.</p>
          ) : loading ? (
            <div className="customerDocViewerLoading">
              <Loader2 size={28} className="customerDocViewerSpinner" />
              <span>Loading document…</span>
            </div>
          ) : error ? (
            <p className="customerDocViewerError">{error}</p>
          ) : blobUrl && isImage ? (
            <img src={blobUrl} alt={label} className="customerDocViewerImage" />
          ) : blobUrl && isPdf ? (
            <iframe title={label} src={blobUrl} className="customerDocViewerFrame" />
          ) : blobUrl ? (
            <iframe title={label} src={blobUrl} className="customerDocViewerFrame" />
          ) : null}
        </div>
      </div>
    </div>
  )
}
