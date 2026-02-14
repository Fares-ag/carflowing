import { useState } from 'react'
import {
  Car,
  ChevronDown,
  FileText,
  Gauge,
  ImagePlus,
  Palette,
  Settings,
  Tag,
  Wrench,
  X,
} from 'lucide-react'
import './AddCarModal.css'

type AddCarModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: () => void
}

export function AddCarModal({ open, onClose, onSubmit }: AddCarModalProps) {
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

  if (!open) return null

  const handleChange = (field: keyof typeof formData) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [field]: event.target.value }))
  }

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
                <option value="dealer-1">Dealer 1</option>
                <option value="dealer-2">Dealer 2</option>
                <option value="dealer-3">Dealer 3</option>
              </select>
              <ChevronDown size={14} />
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
                  <ChevronDown size={14} />
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
                  </select>
                  <ChevronDown size={14} />
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
                  <ChevronDown size={14} />
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
                  <ChevronDown size={14} />
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
                  <ChevronDown size={14} />
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
            <button className="adminAddCarUpload" type="button">
              <ImagePlus size={16} />
              <span>Click to upload images</span>
              <span className="adminAddCarUploadHint">PNG, JPG up to 10MB</span>
            </button>
          </div>
        </div>

        <div className="adminAddCarFooter">
          <button className="adminAddCarBtn adminAddCarBtn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="adminAddCarBtn adminAddCarBtn--primary" type="button" onClick={onSubmit}>
            <Wrench size={14} />
            Add Car
          </button>
        </div>
      </div>
    </div>
  )
}
