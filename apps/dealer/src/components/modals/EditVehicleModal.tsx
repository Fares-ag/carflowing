import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import type { VehicleCategory } from '@carflow/shared'
import { uploadVehicleImage } from '@carflow/shared'
import { Modal } from './Modal'
import './EditVehicleModal.css'

export type EditVehicleStatus = 'Available' | 'Rented' | 'Maintenance'

export interface EditVehicleValues {
  vehicleName: string
  make: string
  model: string
  fuelType: 'gas' | 'diesel' | 'electric' | 'hybrid'
  category: VehicleCategory
  transmission: 'automatic' | 'manual'
  dailyRate: string
  seatingCapacity: string
  year: string
  mileage: string
  status: EditVehicleStatus
  imageUrl?: string
}

export interface EditVehicleModalProps {
  isOpen: boolean
  initialValues: EditVehicleValues
  onClose: () => void
  onSave?: (values: EditVehicleValues) => void
}

const CATEGORY_OPTIONS: { value: VehicleCategory; label: string }[] = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'ev', label: 'EV' },
  { value: 'other', label: 'Other' },
]

export const EditVehicleModal = memo(function EditVehicleModal({
  isOpen,
  initialValues,
  onClose,
  onSave,
}: EditVehicleModalProps) {
  const [values, setValues] = useState<EditVehicleValues>(initialValues)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValues(initialValues)
    setUploadError('')
  }, [initialValues])

  const handleImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      setUploadError('')
      setUploading(true)
      try {
        const url = await uploadVehicleImage(file, 'edit')
        setValues((p) => ({ ...p, imageUrl: url }))
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    []
  )

  if (!isOpen) return null

  return (
    <Modal title="Edit Vehicle" size="sm" onClose={onClose}>
      <div className="editVehicleModal">
        <div className="evHeader">
          <div className="evTitle">Edit Vehicle</div>
          <div className="evSubtitle">Update vehicle information and settings</div>
        </div>

        <div className="evBody">
          <div className="evImageSection">
            <span className="evLabel">Vehicle Image</span>
            <div className="evImageWrap">
              {values.imageUrl ? (
                <img src={values.imageUrl} alt={values.vehicleName} className="evImagePreview" />
              ) : (
                <div className="evImagePlaceholder">
                  <ImagePlus size={24} />
                  <span>No image</span>
                </div>
              )}
              <button
                type="button"
                className="evImageBtn"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Uploading...' : 'Change Image'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={handleImageChange}
              />
            </div>
            {uploadError && <div className="evUploadError">{uploadError}</div>}
          </div>

          <div className="evGrid">
            <label className="evField">
              <span className="evLabel">Vehicle Name</span>
              <input
                className="evInput"
                value={values.vehicleName}
                onChange={(e) => setValues((p) => ({ ...p, vehicleName: e.target.value }))}
              />
            </label>

            <label className="evField">
              <span className="evLabel">Make</span>
              <input
                className="evInput"
                value={values.make}
                onChange={(e) => setValues((p) => ({ ...p, make: e.target.value }))}
              />
            </label>

            <label className="evField">
              <span className="evLabel">Model</span>
              <input
                className="evInput"
                value={values.model}
                onChange={(e) => setValues((p) => ({ ...p, model: e.target.value }))}
              />
            </label>

            <label className="evField">
              <span className="evLabel">Fuel Type</span>
              <select
                className="evSelect"
                value={values.fuelType}
                onChange={(e) =>
                  setValues((p) => ({ ...p, fuelType: e.target.value as EditVehicleValues['fuelType'] }))
                }
              >
                <option value="gas">Petrol</option>
                <option value="diesel">Diesel</option>
                <option value="electric">Electric</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>

            <label className="evField">
              <span className="evLabel">Category</span>
              <select
                className="evSelect"
                value={values.category}
                onChange={(e) =>
                  setValues((p) => ({ ...p, category: e.target.value as VehicleCategory }))
                }
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="evField">
              <span className="evLabel">Transmission</span>
              <select
                className="evSelect"
                value={values.transmission}
                onChange={(e) =>
                  setValues((p) => ({ ...p, transmission: e.target.value as 'automatic' | 'manual' }))
                }
              >
                <option value="automatic">Automatic</option>
                <option value="manual">Manual</option>
              </select>
            </label>

            <label className="evField">
              <span className="evLabel">Daily Rate (QAR)</span>
              <input
                className="evInput"
                value={values.dailyRate}
                onChange={(e) => setValues((p) => ({ ...p, dailyRate: e.target.value }))}
              />
            </label>

            <label className="evField">
              <span className="evLabel">Mileage (km)</span>
              <input
                className="evInput"
                value={values.mileage}
                onChange={(e) => setValues((p) => ({ ...p, mileage: e.target.value.replace(/\D/g, '') }))}
              />
            </label>

            <label className="evField">
              <span className="evLabel">Seating Capacity</span>
              <select
                className="evSelect"
                value={values.seatingCapacity}
                onChange={(e) => setValues((p) => ({ ...p, seatingCapacity: e.target.value }))}
              >
                {['2', '4', '5', '6', '7', '8'].map((n) => (
                  <option key={n} value={n}>
                    {n} Seats
                  </option>
                ))}
              </select>
            </label>

            <label className="evField">
              <span className="evLabel">Year</span>
              <input
                className="evInput"
                value={values.year}
                onChange={(e) => setValues((p) => ({ ...p, year: e.target.value }))}
              />
            </label>

            <label className="evField">
              <span className="evLabel">Status</span>
              <select
                className="evSelect"
                value={values.status}
                onChange={(e) => setValues((p) => ({ ...p, status: e.target.value as EditVehicleStatus }))}
              >
                <option value="Available">Available</option>
                <option value="Rented">Rented</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </label>
          </div>
        </div>

        <div className="evFooter">
          <button className="evBtn evBtnGhost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="evBtn evBtnPrimary"
            type="button"
            onClick={() => {
              onSave?.(values)
              onClose()
            }}
          >
            💾 Save Changes
          </button>
        </div>
      </div>
    </Modal>
  )
})
