import { deleteVehicleImage, uploadVehicleImage } from '@carflow/shared'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { useRef, useState } from 'react'

export const MAX_RENTAL_CONDITION_PHOTOS = 20

interface RentalConditionPhotoUploaderProps {
  id: string
  photos: string[]
  onChange: (photos: string[]) => void
  uploadPrefix: string
  disabled?: boolean
  label?: string
  hint?: string
  onUploadingChange?: (uploading: boolean) => void
}

export function RentalConditionPhotoUploader({
  id,
  photos,
  onChange,
  uploadPrefix,
  disabled = false,
  label = 'Condition photos',
  hint = 'Optional — capture scratches, dents, or interior before submitting.',
  onUploadingChange,
}: RentalConditionPhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const atCap = photos.length >= MAX_RENTAL_CONDITION_PHOTOS

  const handlePick = () => {
    if (disabled || uploading || atCap) return
    inputRef.current?.click()
  }

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || disabled || uploading) return
    const remaining = MAX_RENTAL_CONDITION_PHOTOS - photos.length
    const files = Array.from(fileList).slice(0, remaining)
    if (files.length === 0) return

    setUploading(true)
    onUploadingChange?.(true)
    setError(null)
    const uploaded: string[] = []

    try {
      for (const file of files) {
        const url = await uploadVehicleImage(file, uploadPrefix)
        uploaded.push(url)
      }
      onChange([...photos, ...uploaded])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed')
      if (uploaded.length > 0) {
        onChange([...photos, ...uploaded])
      }
    } finally {
      setUploading(false)
      onUploadingChange?.(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = (url: string) => {
    if (disabled || uploading) return
    onChange(photos.filter((photo) => photo !== url))
    void deleteVehicleImage(url)
  }

  return (
    <div className="rnPhotoUploader">
      <div className="rnPhotoUploaderHead">
        <label className="rnFormLabel" htmlFor={id}>
          {label}
        </label>
        <span className="rnPhotoUploaderCount">
          {photos.length} / {MAX_RENTAL_CONDITION_PHOTOS}
        </span>
      </div>
      <p className="rnPhotoUploaderHint">{hint}</p>

      {photos.length > 0 ? (
        <ul className="rnPhotoGrid" aria-label="Selected condition photos">
          {photos.map((url, index) => (
            <li key={url} className="rnPhotoThumb">
              <img src={url} alt={`Condition photo ${index + 1}`} />
              <button
                type="button"
                className="rnPhotoRemove"
                aria-label={`Remove photo ${index + 1}`}
                disabled={disabled || uploading}
                onClick={() => handleRemove(url)}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        id={id}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="rnPhotoInput"
        disabled={disabled || uploading || atCap}
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <button
        type="button"
        className="rnPhotoAddBtn"
        disabled={disabled || uploading || atCap}
        onClick={handlePick}
      >
        {uploading ? <Loader2 size={16} className="rnPhotoSpinner" aria-hidden /> : <ImagePlus size={16} />}
        {uploading ? 'Uploading…' : atCap ? 'Photo limit reached' : 'Add photos'}
      </button>

      {error ? (
        <p className="rnPhotoError" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface RentalEventPhotoGridProps {
  photos: string[]
  className?: string
}

export function RentalEventPhotoGrid({ photos, className = 'rnEventPhotos' }: RentalEventPhotoGridProps) {
  if (!photos.length) return null

  return (
    <div className={className}>
      {photos.map((url, index) => (
        <a
          key={`${url}-${index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rnEventPhotoLink"
          aria-label={`Open condition photo ${index + 1}`}
        >
          <img src={url} alt={`Condition photo ${index + 1}`} loading="lazy" />
        </a>
      ))}
    </div>
  )
}
