import type { Dealer } from '@carflow/shared'
import { uploadVehicleImage } from '@carflow/shared'
import {
  Car,
  FileText,
  Gauge,
  ImagePlus,
  Palette,
  Settings,
  Tag,
  Wrench,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import './AddCarModal.css'

const TYPE_TO_CATEGORY: Record<string, 'sedan' | 'suv' | 'truck' | 'luxury' | 'ev' | 'other'> = {
  SUV: 'suv',
  Sedan: 'sedan',
  Luxury: 'luxury',
  Electric: 'ev',
  Truck: 'truck',
}

const FUEL_MAP: Record<string, 'gas' | 'diesel' | 'electric' | 'hybrid'> = {
  Petrol: 'gas',
  Diesel: 'diesel',
  Hybrid: 'hybrid',
  Electric: 'electric',
}

type AddCarModalProps = {
  open: boolean
  onClose: () => void
  dealers: Dealer[]
  onSubmit: (data: {
    dealerId: string
    name: string
    make: string
    model: string
    year: number
    category: 'sedan' | 'suv' | 'truck' | 'luxury' | 'ev' | 'other'
    pricePerDay: number
    mileage: number
    transmission: 'automatic' | 'manual'
    fuelType: 'gas' | 'diesel' | 'electric' | 'hybrid'
    seats: number
    imageUrl?: string
  }) => void
}

export function AddCarModal({ open, onClose, dealers, onSubmit }: AddCarModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    dealer: '',
    make: '',
    model: '',
    year: '',
    type: '',
    color: '',
    plate: '',
    fuel: '',
    transmission: '',
    seats: '',
    mileage: '',
    dailyRate: '',
    weeklyRate: '',
    monthlyRate: '',
    description: '',
    features: '',
  })
  const [imageUrl, setImageUrl] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const handleChange = (field: keyof typeof formData) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [field]: event.target.value }))
  }

  const handleImageClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  useEffect(() => {
    if (!open) {
      setImageUrl('')
      setUploadError('')
    }
  }, [open])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadError('')
    setUploading(true)
    try {
      const url = await uploadVehicleImage(file)
      setImageUrl(url)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [])

  if (!open) return null

  return (
    <div className="adminAddCarOverlay" role="dialog" aria-modal="true">
      <div className="adminAddCarModal">
        <button className="adminAddCarClose" type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="adminAddCarHeader">
          <div className="adminAddCarTitleRow">
            <span className="adminAddCarTitleIcon">
              <Car size={18} />
            </span>
            <h2>Add Car on Behalf of Dealer</h2>
          </div>
          <p>Add a new vehicle to the platform on behalf of a registered dealer</p>
        </div>

        <div className="adminAddCarBody">
          <div className="adminAddCarSection">
            <div className="adminAddCarSectionTitle">
              <span className="adminAddCarSectionIcon">
                <Tag size={16} />
              </span>
              <h3>Select Dealer *</h3>
            </div>
            <label className="adminAddCarSelect">
              <select value={formData.dealer} onChange={handleChange('dealer')}>
                <option value="">Choose a dealer...</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="adminAddCarDivider" />

          <div className="adminAddCarSection">
            <div className="adminAddCarSectionTitle">
              <span className="adminAddCarSectionIcon">
                <Car size={16} />
              </span>
              <h3>Vehicle Information</h3>
            </div>
            <div className="adminAddCarGrid adminAddCarGrid--three">
              <label>
                Make *
                <div className="adminAddCarSelect">
                  <select value={formData.make} onChange={handleChange('make')}>
                    <option value="">Select make</option>
                    <option value="BMW">BMW</option>
                    <option value="Mercedes">Mercedes</option>
                    <option value="Tesla">Tesla</option>
                    <option value="Toyota">Toyota</option>
                  </select>
                </div>
              </label>
              <label>
                Model *
                <input
                  type="text"
                  placeholder="e.g., Camry"
                  value={formData.model}
                  onChange={handleChange('model')}
                />
              </label>
              <label>
                Year *
                <input
                  type="text"
                  placeholder="e.g., 2024"
                  value={formData.year}
                  onChange={handleChange('year')}
                />
              </label>
              <label>
                Type *
                <div className="adminAddCarSelect">
                  <select value={formData.type} onChange={handleChange('type')}>
                    <option value="">Select type</option>
                    <option value="SUV">SUV</option>
                    <option value="Sedan">Sedan</option>
                    <option value="Luxury">Luxury</option>
                    <option value="Electric">Electric</option>
                    <option value="Truck">Truck</option>
                  </select>
                </div>
              </label>
              <label>
                Color
                <div className="adminAddCarSelect">
                  <select value={formData.color} onChange={handleChange('color')}>
                    <option value="">Select color</option>
                    <option value="Black">Black</option>
                    <option value="White">White</option>
                    <option value="Silver">Silver</option>
                    <option value="Blue">Blue</option>
                  </select>
                </div>
              </label>
              <label>
                Plate Number
                <input
                  type="text"
                  placeholder="e.g., ABC-1234"
                  value={formData.plate}
                  onChange={handleChange('plate')}
                />
              </label>
            </div>
          </div>

          <div className="adminAddCarDivider" />

          <div className="adminAddCarSection">
            <div className="adminAddCarSectionTitle">
              <span className="adminAddCarSectionIcon">
                <Settings size={16} />
              </span>
              <h3>Specifications</h3>
            </div>
            <div className="adminAddCarGrid adminAddCarGrid--two">
              <label>
                Fuel Type
                <div className="adminAddCarSelect">
                  <select value={formData.fuel} onChange={handleChange('fuel')}>
                    <option value="">Select fuel type</option>
                    <option value="Petrol">Petrol</option>
                    <option value="Diesel">Diesel</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Electric">Electric</option>
                  </select>
                </div>
              </label>
              <label>
                Transmission
                <div className="adminAddCarSelect">
                  <select value={formData.transmission} onChange={handleChange('transmission')}>
                    <option value="">Select transmission</option>
                    <option value="Automatic">Automatic</option>
                    <option value="Manual">Manual</option>
                    <option value="CVT">CVT</option>
                  </select>
                </div>
              </label>
              <label>
                Seats
                <input
                  type="text"
                  placeholder="e.g., 5"
                  value={formData.seats}
                  onChange={handleChange('seats')}
                />
              </label>
              <label>
                Mileage (km)
                <input
                  type="text"
                  placeholder="e.g., 15000"
                  value={formData.mileage}
                  onChange={handleChange('mileage')}
                />
              </label>
            </div>
          </div>

          <div className="adminAddCarDivider" />

          <div className="adminAddCarSection">
            <div className="adminAddCarSectionTitle">
              <span className="adminAddCarSectionIcon">
                <Gauge size={16} />
              </span>
              <h3>Pricing (QAR)</h3>
            </div>
            <div className="adminAddCarGrid adminAddCarGrid--three">
              <label>
                Daily Rate *
                <input
                  type="text"
                  placeholder="e.g., 250"
                  value={formData.dailyRate}
                  onChange={handleChange('dailyRate')}
                />
              </label>
              <label>
                Weekly Rate
                <input
                  type="text"
                  placeholder="e.g., 1500"
                  value={formData.weeklyRate}
                  onChange={handleChange('weeklyRate')}
                />
              </label>
              <label>
                Monthly Rate
                <input
                  type="text"
                  placeholder="e.g., 5000"
                  value={formData.monthlyRate}
                  onChange={handleChange('monthlyRate')}
                />
              </label>
            </div>
          </div>

          <div className="adminAddCarDivider" />

          <div className="adminAddCarSection">
            <div className="adminAddCarSectionTitle">
              <span className="adminAddCarSectionIcon">
                <FileText size={16} />
              </span>
              <h3>Additional Details</h3>
            </div>
            <label>
              Description
              <textarea
                rows={3}
                placeholder="Describe the vehicle, its condition, and any special features..."
                value={formData.description}
                onChange={handleChange('description')}
              />
            </label>
            <label>
              Features (comma-separated)
              <input
                type="text"
                placeholder="e.g., GPS, Bluetooth, Sunroof, Leather Seats"
                value={formData.features}
                onChange={handleChange('features')}
              />
            </label>
          </div>

          <div className="adminAddCarDivider" />

          <div className="adminAddCarSection">
            <div className="adminAddCarSectionTitle">
              <span className="adminAddCarSectionIcon">
                <Palette size={16} />
              </span>
              <h3>Vehicle Images</h3>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="adminAddCarFileInput"
              aria-hidden
              onChange={handleFileChange}
            />
            {uploadError && <div className="adminAddCarUploadError">{uploadError}</div>}
            <button
              className="adminAddCarUpload"
              type="button"
              onClick={handleImageClick}
              disabled={uploading}
            >
              {imageUrl ? (
                <img src={imageUrl} alt="Vehicle" className="adminAddCarPreview" />
              ) : (
                <>
                  <ImagePlus size={16} />
                  <span>{uploading ? 'Uploading...' : 'Click to upload image'}</span>
                  <span className="adminAddCarUploadHint">PNG, JPG, WebP up to 5MB</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="adminAddCarFooter">
          <button className="adminAddCarBtn adminAddCarBtn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="adminAddCarBtn adminAddCarBtn--primary"
            type="button"
            onClick={() => {
              if (!formData.dealer || !formData.make || !formData.model || !formData.year || !formData.dailyRate || !formData.type) return
              const category = TYPE_TO_CATEGORY[formData.type] ?? 'other'
              const name = `${formData.make} ${formData.model}`
              onSubmit({
                dealerId: formData.dealer,
                name,
                make: formData.make,
                model: formData.model,
                year: Number(formData.year) || 2024,
                category,
                pricePerDay: Number(formData.dailyRate) || 0,
                mileage: Number(formData.mileage) || 0,
                transmission: formData.transmission === 'Manual' ? 'manual' : 'automatic',
                fuelType: FUEL_MAP[formData.fuel] ?? 'gas',
                seats: Number(formData.seats) || 5,
                imageUrl: imageUrl || undefined,
              })
            }}
          >
            <Wrench size={14} />
            Add Car
          </button>
        </div>
      </div>
    </div>
  )
}
