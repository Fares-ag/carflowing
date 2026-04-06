import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { Car, CheckCircle2, DollarSign, FileText, ImagePlus, Wrench } from 'lucide-react'
import { uploadVehicleImage } from '@carflow/shared'
import './AddVehicleModal.css'

function splitNameToMakeModel(fullName: string): { make: string; model: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { make: 'Brand', model: 'Model' }
  if (parts.length === 1) return { make: parts[0], model: 'Model' }
  return { make: parts[0], model: parts.slice(1).join(' ') }
}

export interface AddVehicleModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate?: (values: {
    name: string
    make: string
    model: string
    category: 'SUV' | 'Sedan'
    year: number
    dailyRateQar: number
    status: 'Available' | 'Rented' | 'Maintenance'
    imageUrl?: string
    mileage?: number
    fuelType?: 'gas' | 'diesel' | 'electric' | 'hybrid'
    transmission?: 'automatic' | 'manual'
    seats?: number
  }) => void
}

export const AddVehicleModal = memo(function AddVehicleModal({ isOpen, onClose, onCreate }: AddVehicleModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingSlot, setPendingSlot] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<'SUV' | 'Sedan'>('SUV')
  const [year, setYear] = useState('2024')
  const [dailyRate, setDailyRate] = useState('300')
  const [status, setStatus] = useState<'Available' | 'Rented' | 'Maintenance'>('Available')
  const [mileage, setMileage] = useState('15000')
  const [fuelType, setFuelType] = useState<'gas' | 'diesel' | 'electric' | 'hybrid'>('gas')
  const [transmission, setTransmission] = useState<'automatic' | 'manual'>('automatic')
  const [seats, setSeats] = useState('5')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setImageUrls([])
      setUploadError('')
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

  if (!isOpen) return null

  return (
    <Modal open={isOpen} title="Add New Vehicle" size="lg" onClose={onClose}>
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
                    disabled={isUploading}
                  >
                    <div className="avPhotoSlotInner">
                      {url ? (
                        <img src={url} alt={`Photo ${i + 1}`} className="avPhotoPreview" />
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
                  />
                </label>

                <label className="avField">
                  <span className="avLabelCaps">Category *</span>
                  <select
                    className="avSelect"
                    value={category}
                    onChange={(event) => setCategory(event.target.value as 'SUV' | 'Sedan')}
                  >
                    <option value="SUV">SUV</option>
                    <option value="Sedan">Sedan</option>
                  </select>
                </label>

                <div className="avRow2">
                  <label className="avField">
                    <span className="avLabelCaps">Year *</span>
                    <input
                      className="avInput avInputTall"
                      value={year}
                      onChange={(event) => setYear(event.target.value)}
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
                  <div className="avPreviewCardMeta">{summary.category || 'Category not selected'}</div>
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
                    {summary.dailyRate ? `QAR ${summary.dailyRate}` : 'Price not set'}
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
            <div className="avFooterNoteBottom">All mandatory information should be provided before submission</div>
          </div>
          <div className="avFooterActions">
            <button className="avFooterBtn avFooterBtn--ghost" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="avFooterBtn avFooterBtn--primary"
              type="button"
              onClick={() => {
                const trimmed = name.trim() || 'New Vehicle'
                const { make, model } = splitNameToMakeModel(trimmed)
                onCreate?.({
                  name: trimmed,
                  make,
                  model,
                  category,
                  year: Number(year) || 2024,
                  dailyRateQar: Number(dailyRate) || 300,
                  status,
                  imageUrl: imageUrls[0],
                  mileage: Number(mileage.replace(/\D/g, '')) || 0,
                  fuelType,
                  transmission,
                  seats: Number(seats) || 5,
                })
                onClose()
              }}
            >
              <Car size={14} />
              Add Vehicle to Inventory
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
})
