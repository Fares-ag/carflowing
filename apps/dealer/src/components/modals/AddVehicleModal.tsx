import type { VehicleCategory } from '@carflow/shared'
import { BROWSE_LOCATION_OPTIONS, formatCurrency, uploadVehicleImage, VEHICLE_FEATURE_OPTIONS } from '@carflow/shared'
import { Car, CheckCircle2, DollarSign, FileText, ImagePlus, Wrench } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import './AddVehicleModal.css'

function splitNameToMakeModel(fullName: string): { make: string; model: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { make: 'Brand', model: 'Model' }
  if (parts.length === 1) return { make: parts[0], model: 'Model' }
  return { make: parts[0], model: parts.slice(1).join(' ') }
}

const CATEGORY_OPTIONS: { value: VehicleCategory; label: string }[] = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'ev', label: 'EV' },
  { value: 'other', label: 'Other' },
]

const CURRENT_YEAR = new Date().getFullYear()

export type AddVehicleValues = {
  name: string
  make: string
  model: string
  category: VehicleCategory
  year: number
  dailyRateQar: number
  status: 'Available' | 'Rented' | 'Maintenance'
  imageUrl?: string
  imageUrls?: string[]
  description?: string
  color?: string
  locationCity?: string
  locationArea?: string
  mileageCapKm?: number
  features?: string[]
  mileage?: number
  fuelType?: 'gas' | 'diesel' | 'electric' | 'hybrid'
  transmission?: 'automatic' | 'manual'
  seats?: number
}

export interface AddVehicleModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate?: (values: AddVehicleValues) => void | Promise<void>
}

function categoryLabel(category: VehicleCategory): string {
  return CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category
}

export const AddVehicleModal = memo(function AddVehicleModal({ isOpen, onClose, onCreate }: AddVehicleModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingSlot, setPendingSlot] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<VehicleCategory>('suv')
  const [year, setYear] = useState(String(CURRENT_YEAR))
  const [dailyRate, setDailyRate] = useState('300')
  const [status, setStatus] = useState<'Available' | 'Rented' | 'Maintenance'>('Available')
  const [mileage, setMileage] = useState('15000')
  const [fuelType, setFuelType] = useState<'gas' | 'diesel' | 'electric' | 'hybrid'>('gas')
  const [transmission, setTransmission] = useState<'automatic' | 'manual'>('automatic')
  const [seats, setSeats] = useState('5')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('')
  const [locationCity, setLocationCity] = useState<string>(BROWSE_LOCATION_OPTIONS[0])
  const [locationArea, setLocationArea] = useState('')
  const [mileageCapKm, setMileageCapKm] = useState('')
  const [features, setFeatures] = useState<string[]>([])
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setImageUrls([])
      setUploadError('')
      setFormError('')
      setSubmitting(false)
      setName('')
      setCategory('suv')
      setYear(String(CURRENT_YEAR))
      setDailyRate('300')
      setStatus('Available')
      setMileage('15000')
      setFuelType('gas')
      setTransmission('automatic')
      setSeats('5')
      setDescription('')
      setColor('')
      setLocationCity(BROWSE_LOCATION_OPTIONS[0])
      setLocationArea('')
      setMileageCapKm('')
      setFeatures([])
    }
  }, [isOpen])

  const handlePhotoClick = useCallback((index: number) => {
    setPendingSlot(index)
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      const index = pendingSlot ?? 0
      setPendingSlot(null)
      if (!file) return
      setUploadError('')
      setUploadingIndex(index)
      try {
        const url = await uploadVehicleImage(file)
        setImageUrls((prev) => {
          const next = [...prev]
          next[index] = url
          return next
        })
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploadingIndex(null)
      }
    },
    [pendingSlot]
  )

  const summary = useMemo(() => {
    return {
      name,
      category,
      year,
      dailyRate,
      status,
      mileage,
    }
  }, [category, dailyRate, mileage, name, status, year])

  const handleSubmit = async () => {
    if (submitting) return
    const trimmed = name.trim()
    if (!trimmed) {
      setFormError('Vehicle name is required.')
      return
    }
    const yearNum = Number(year)
    if (!Number.isFinite(yearNum) || yearNum < 1990 || yearNum > CURRENT_YEAR + 1) {
      setFormError(`Year must be between 1990 and ${CURRENT_YEAR + 1}.`)
      return
    }
    const rateNum = Number(dailyRate)
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      setFormError('Daily rate must be a positive number.')
      return
    }

    setFormError('')
    setSubmitting(true)
    const { make, model } = splitNameToMakeModel(trimmed)
    const uploadedPhotos = imageUrls.filter(Boolean)
    const cap = Number(mileageCapKm.replace(/\D/g, ''))
    try {
      await onCreate?.({
        name: trimmed,
        make,
        model,
        category,
        year: yearNum,
        dailyRateQar: rateNum,
        status,
        imageUrl: uploadedPhotos[0],
        imageUrls: uploadedPhotos,
        description: description.trim() || undefined,
        color: color.trim() || undefined,
        locationCity,
        locationArea: locationArea.trim() || undefined,
        mileageCapKm: Number.isFinite(cap) && cap > 0 ? cap : undefined,
        features: features.length ? features : undefined,
        mileage: Number(mileage.replace(/\D/g, '')) || 0,
        fuelType,
        transmission,
        seats: Number(seats) || 5,
      })
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add vehicle')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal open={isOpen} title="Add New Vehicle" size="lg" onClose={submitting ? () => undefined : onClose}>
      <div className="addVehicleModal">
        <div className="avHeader">
          <div className="avHeaderTitle">Add New Vehicle</div>
          <div className="avHeaderSubtitle">
            Add a new vehicle to your inventory with photos and specifications
          </div>
        </div>

        <div className="avBody">
          <section className="avSection">
            <div className="avSectionHeading">
              <span className="avSectionIcon" aria-hidden="true">
                <ImagePlus size={16} />
              </span>
              <div className="avSectionTitle">Vehicle Photos</div>
              <div className="avSectionHint">(up to 6 photos)</div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="avFileInput"
              aria-hidden
              onChange={handleFileChange}
            />
            {uploadError && <div className="avUploadError">{uploadError}</div>}
            <div className="avPhotoGrid">
              {Array.from({ length: 6 }).map((_, i) => {
                const url = imageUrls[i]
                const isUploading = uploadingIndex === i
                return (
                  <button
                    key={i}
                    className="avPhotoSlot"
                    type="button"
                    onClick={() => handlePhotoClick(i)}
                    disabled={isUploading || submitting}
                  >
                    <div className="avPhotoSlotInner">
                      {url ? (
                        <img src={url} alt={`Vehicle upload ${i + 1}`} className="avPhotoPreview" />
                      ) : (
                        <>
                          <div className="avPhotoPlus" aria-hidden="true">
                            {isUploading ? (
                              <span className="avPhotoSpinner" />
                            ) : (
                              <ImagePlus size={14} />
                            )}
                          </div>
                          <div className="avPhotoText">{isUploading ? 'Uploading...' : 'Add Photo'}</div>
                        </>
                      )}
                      <div className="avPhotoIndex">Photo {i + 1}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="avTwoCol">
            <div className="avCol">
              <div className="avColHeader">
                <span className="avColHeaderIcon" aria-hidden="true">
                  <FileText size={16} />
                </span>
                <div className="avColHeaderTitle">Basic Information</div>
              </div>

              <div className="avFields">
                <label className="avField">
                  <span className="avLabel">Vehicle Name *</span>
                  <input
                    className="avInput"
                    placeholder="e.g., BMW X3 2024 Premium"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={submitting}
                  />
                </label>

                <label className="avField">
                  <span className="avLabelCaps">Category *</span>
                  <select
                    className="avSelect"
                    value={category}
                    onChange={(event) => setCategory(event.target.value as VehicleCategory)}
                    disabled={submitting}
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="avRow2">
                  <label className="avField">
                    <span className="avLabelCaps">Year *</span>
                    <input
                      className="avInput avInputTall"
                      value={year}
                      onChange={(event) => setYear(event.target.value.replace(/\D/g, '').slice(0, 4))}
                      disabled={submitting}
                    />
                  </label>
                  <label className="avField">
                    <span className="avLabelCaps">Daily Rate (QAR) *</span>
                    <div className="avCurrencyWrap">
                      <span className="avCurrency">QAR</span>
                      <input
                        className="avInput avInputTall avCurrencyInput"
                        value={dailyRate}
                        onChange={(event) => setDailyRate(event.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="avCol">
              <div className="avColCenteredHeader">
                <div className="avBigIcon" aria-hidden="true">
                  <Wrench size={20} />
                </div>
                <div className="avCenteredTitle">Technical Specifications</div>
                <div className="avCenteredSubtitle">Performance details and mechanical specifications</div>
              </div>

              <div className="avFields avFields--spec">
                <label className="avField">
                  <span className="avLabelCaps">Mileage (km)</span>
                  <div className="avUnitWrap">
                    <input
                      className="avInput avInputTall"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value.replace(/\D/g, ''))}
                      disabled={submitting}
                    />
                    <span className="avUnit">km</span>
                  </div>
                </label>

                <div className="avRow2">
                  <label className="avField">
                    <span className="avLabelCaps">Fuel Type</span>
                    <select
                      className="avSelect"
                      value={fuelType}
                      onChange={(e) => setFuelType(e.target.value as 'gas' | 'diesel' | 'electric' | 'hybrid')}
                      disabled={submitting}
                    >
                      <option value="gas">Petrol</option>
                      <option value="diesel">Diesel</option>
                      <option value="electric">Electric</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </label>
                  <label className="avField">
                    <span className="avLabelCaps">Transmission</span>
                    <select
                      className="avSelect"
                      value={transmission}
                      onChange={(e) => setTransmission(e.target.value as 'automatic' | 'manual')}
                      disabled={submitting}
                    >
                      <option value="automatic">Automatic</option>
                      <option value="manual">Manual</option>
                    </select>
                  </label>
                </div>

                <div className="avRow2">
                  <label className="avField">
                    <span className="avLabelCaps">Number of Seats</span>
                    <select
                      className="avSelect"
                      value={seats}
                      onChange={(e) => setSeats(e.target.value)}
                      disabled={submitting}
                    >
                      {[2, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n} value={n}>
                          {n} Seats
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="avField">
                    <span className="avLabelCaps">Vehicle Status</span>
                    <select
                      className="avSelect"
                      value={status}
                      onChange={(event) =>
                        setStatus(event.target.value as 'Available' | 'Rented' | 'Maintenance')
                      }
                      disabled={submitting}
                    >
                      <option value="Available">Available</option>
                      <option value="Rented">Rented</option>
                      <option value="Maintenance">Maintenance</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section className="avSection">
            <div className="avSectionHeading">
              <span className="avSectionIcon" aria-hidden="true">
                <FileText size={16} />
              </span>
              <div className="avSectionTitle">Description &amp; features</div>
            </div>
            <div className="avFields">
              <label className="avField">
                <span className="avLabelCaps">Description</span>
                <textarea
                  className="avTextarea"
                  rows={3}
                  placeholder="Describe the vehicle, its condition, and highlights…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                />
              </label>
              <label className="avField">
                <span className="avLabelCaps">Color</span>
                <input
                  className="avInput avInputTall"
                  placeholder="e.g. Pearl White"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={submitting}
                />
              </label>
              <div className="avRow2">
                <label className="avField">
                  <span className="avLabelCaps">City</span>
                  <select
                    className="avSelect"
                    value={locationCity}
                    onChange={(e) => setLocationCity(e.target.value)}
                    disabled={submitting}
                  >
                    {BROWSE_LOCATION_OPTIONS.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="avField">
                  <span className="avLabelCaps">Area / branch</span>
                  <input
                    className="avInput avInputTall"
                    placeholder="e.g. West Bay"
                    value={locationArea}
                    onChange={(e) => setLocationArea(e.target.value)}
                    disabled={submitting}
                  />
                </label>
              </div>
              <label className="avField">
                <span className="avLabelCaps">Monthly mileage cap (km)</span>
                <div className="avUnitWrap">
                  <input
                    className="avInput avInputTall"
                    value={mileageCapKm}
                    onChange={(e) => setMileageCapKm(e.target.value.replace(/\D/g, ''))}
                    placeholder="Optional — e.g. 2500"
                    disabled={submitting}
                  />
                  <span className="avUnit">km/mo</span>
                </div>
              </label>
              <fieldset className="avFeatures">
                <legend className="avLabelCaps">Features</legend>
                <div className="avFeatureGrid">
                  {VEHICLE_FEATURE_OPTIONS.map((feature) => (
                    <label key={feature} className="avFeatureOption">
                      <input
                        type="checkbox"
                        checked={features.includes(feature)}
                        onChange={(e) => {
                          setFeatures((prev) =>
                            e.target.checked ? [...prev, feature] : prev.filter((f) => f !== feature)
                          )
                        }}
                        disabled={submitting}
                      />
                      <span>{feature}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>

          <section className="avPreviewSection">
            <div className="avPreviewInner">
              <div className="avPreviewHeader">
                <div className="avPreviewIcon" aria-hidden="true">
                  <CheckCircle2 size={18} />
                </div>
                <div className="avPreviewTitle">Vehicle Summary Preview</div>
                <div className="avPreviewSubtitle">Review your vehicle information before adding to inventory</div>
              </div>

              <div className="avPreviewCards">
                <div className="avPreviewCard">
                  <div className="avPreviewCardIcon" aria-hidden="true">
                    <FileText size={16} />
                  </div>
                  <div className="avPreviewCardLabel">Vehicle Details</div>
                  <div className="avPreviewCardValue">{summary.name || 'Name not specified'}</div>
                  <div className="avPreviewCardMeta">{categoryLabel(summary.category)}</div>
                  <div className="avPreviewCardSub">
                    {summary.mileage ? `${Number(summary.mileage).toLocaleString()} km` : 'Mileage not set'}
                  </div>
                </div>
                <div className="avPreviewCard">
                  <div className="avPreviewCardIcon" aria-hidden="true">
                    <DollarSign size={16} />
                  </div>
                  <div className="avPreviewCardLabel">Pricing &amp; Year</div>
                  <div className="avPreviewCardValue avPreviewCardValue--accent">
                    {summary.dailyRate ? formatCurrency(Number(summary.dailyRate)) : 'Price not set'}
                  </div>
                  <div className="avPreviewCardMeta">{summary.year || 'Year not specified'}</div>
                  <div className="avPreviewCardSub">Per day rental rate</div>
                </div>
                <div className="avPreviewCard">
                  <div className="avPreviewCardIcon" aria-hidden="true">
                    <Wrench size={16} />
                  </div>
                  <div className="avPreviewCardLabel">Specs &amp; Status</div>
                  <div className="avPreviewCardValue">{summary.status}</div>
                  <div className="avPreviewCardMeta">
                    {transmission === 'automatic' ? 'Automatic' : 'Manual'} · {seats} seats
                  </div>
                  <div className="avPreviewCardSub">
                    {fuelType === 'gas'
                      ? 'Petrol'
                      : fuelType === 'diesel'
                        ? 'Diesel'
                        : fuelType === 'electric'
                          ? 'Electric'
                          : 'Hybrid'}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="avFooter">
          <div className="avFooterNote">
            <div className="avFooterNoteTop">* Required fields must be completed</div>
            <div className="avFooterNoteBottom">
              {formError ? <span className="avUploadError">{formError}</span> : 'All mandatory information should be provided before submission'}
            </div>
          </div>
          <div className="avFooterActions">
            <button
              className="avFooterBtn avFooterBtn--ghost"
              type="button"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="avFooterBtn avFooterBtn--primary"
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              aria-busy={submitting}
            >
              <Car size={14} />
              {submitting ? 'Adding…' : 'Add Vehicle to Inventory'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
})
