import { memo, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { Car, CheckCircle2, DollarSign, FileText, ImagePlus, PenLine, Sparkles, Star, Wrench } from 'lucide-react'
import './AddVehicleModal.css'

const FEATURE_OPTIONS = [
  'Air Conditioning',
  'Leather Seats',
  'Sunroof',
  'Navigation GPS',
  'Bluetooth',
  'Backup Camera',
  'Heated Seats',
  'Premium Sound',
  'Cruise Control',
  'Parking Sensors',
  'Keyless Entry',
  'USB Charging',
  'Apple CarPlay',
  'Android Auto',
  'Wireless Charging',
  'Seat Memory',
  'Climate Control',
  'Tinted Windows',
  'Alloy Wheels',
  'Sport Mode',
  'Lane Departure Warning',
  'Collision Detection',
  'Blind Spot Monitor',
  'Maintenance Included',
  'Insurance Included',
  'Free Delivery',
  '24/7 Support',
  'Roadside Assistance'
] as const

type Feature = (typeof FEATURE_OPTIONS)[number]

export interface AddVehicleModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate?: (values: {
    name: string
    category: 'SUV' | 'Sedan'
    year: number
    dailyRateQar: number
    status: 'Available' | 'Rented' | 'Maintenance'
  }) => void
}

export const AddVehicleModal = memo(function AddVehicleModal({ isOpen, onClose, onCreate }: AddVehicleModalProps) {
  const [features, setFeatures] = useState<Set<Feature>>(() => new Set())
  const [name, setName] = useState('')
  const [category, setCategory] = useState<'SUV' | 'Sedan'>('SUV')
  const [year, setYear] = useState('2024')
  const [dailyRate, setDailyRate] = useState('300')
  const [status, setStatus] = useState<'Available' | 'Rented' | 'Maintenance'>('Available')

  const featureCount = features.size
  const summary = useMemo(() => {
    return {
      name,
      category,
      color: '',
      year,
      dailyRate,
      status,
    }
  }, [category, dailyRate, name, status, year])

  if (!isOpen) return null

  return (
    <Modal title="Add New Vehicle" size="lg" onClose={onClose}>
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

            <div className="avPhotoGrid">
              {Array.from({ length: 6 }).map((_, i) => (
                <button key={i} className="avPhotoSlot" type="button">
                  <div className="avPhotoSlotInner">
                    <div className="avPhotoPlus" aria-hidden="true">
                      <ImagePlus size={14} />
                    </div>
                    <div className="avPhotoText">Add Photo</div>
                    <div className="avPhotoIndex">Photo {i + 1}</div>
                  </div>
                </button>
              ))}
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
                    <span className="avLabelCaps">Color *</span>
                    <button className="avSelect" type="button">
                      <span>Select vehicle color</span>
                      <span className="avChevron">▾</span>
                    </button>
                  </label>
                </div>

                <div className="avRow2">
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
                  <label className="avField">
                    <span className="avLabelCaps">Weekly Rate (QAR)</span>
                    <div className="avCurrencyWrap">
                      <span className="avCurrency">QAR</span>
                      <input className="avInput avInputTall avCurrencyInput" defaultValue="1,800" />
                    </div>
                  </label>
                </div>

                <div className="avRow2">
                  <label className="avField">
                    <span className="avLabelCaps">Monthly Rate (QAR)</span>
                    <div className="avCurrencyWrap">
                      <span className="avCurrency">QAR</span>
                      <input className="avInput avInputTall avCurrencyInput" defaultValue="6,000" />
                    </div>
                  </label>
                  <label className="avField">
                    <span className="avLabelCaps">Yearly Rate (QAR)</span>
                    <div className="avCurrencyWrap">
                      <span className="avCurrency">QAR</span>
                      <input className="avInput avInputTall avCurrencyInput" defaultValue="60,000" />
                    </div>
                  </label>
                </div>

                <label className="avField avHalf">
                  <span className="avLabelCaps">License Plate</span>
                  <input className="avInput avInputTall" defaultValue="ABC-123" />
                </label>
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
                <div className="avRow2">
                  <label className="avField">
                    <span className="avLabelCaps">Mileage (km)</span>
                    <div className="avUnitWrap">
                      <input className="avInput avInputTall" defaultValue="15,000" />
                      <span className="avUnit">km</span>
                    </div>
                  </label>
                  <label className="avField">
                    <span className="avLabelCaps">Top Speed (km/h)</span>
                    <div className="avUnitWrap">
                      <input className="avInput avInputTall" defaultValue="220" />
                      <span className="avUnit">km/h</span>
                    </div>
                  </label>
                </div>

                <div className="avRow2">
                  <label className="avField">
                    <span className="avLabelCaps">Fuel Type</span>
                    <button className="avSelect" type="button">
                      <span>Select fuel type</span>
                      <span className="avChevron">▾</span>
                    </button>
                  </label>
                  <label className="avField">
                    <span className="avLabelCaps">Transmission</span>
                    <button className="avSelect" type="button">
                      <span>Select transmission</span>
                      <span className="avChevron">▾</span>
                    </button>
                  </label>
                </div>

                <div className="avRow2">
                  <label className="avField">
                    <span className="avLabelCaps">Number of Seats</span>
                    <button className="avSelect" type="button">
                      <span>Select number of seats</span>
                      <span className="avChevron">▾</span>
                    </button>
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

          <section className="avBigSection">
            <div className="avBigSectionHeader">
              <div className="avBigSectionIcon" aria-hidden="true">
                <Sparkles size={18} />
              </div>
              <div className="avBigSectionTitle">Vehicle Features &amp; Amenities</div>
              <div className="avBigSectionSubtitle">
                Select all applicable features, premium amenities, and exclusive services included with this vehicle
              </div>
            </div>

            <div className="avFeaturesGrid">
              {FEATURE_OPTIONS.map((feature) => {
                const checked = features.has(feature)
                return (
                  <label key={feature} className="avFeatureChip">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setFeatures((prev) => {
                          const next = new Set(prev)
                          if (next.has(feature)) next.delete(feature)
                          else next.add(feature)
                          return next
                        })
                      }}
                    />
                    <span className="avFeatureLabel">{feature}</span>
                  </label>
                )
              })}
            </div>
          </section>

          <section className="avDescSection">
            <div className="avBigSectionHeader avBigSectionHeader--compact">
              <div className="avBigSectionIcon" aria-hidden="true">
                <PenLine size={18} />
              </div>
              <div className="avBigSectionTitle">Vehicle Description</div>
              <div className="avBigSectionSubtitle">
                Provide comprehensive details about the vehicle&apos;s condition and unique features
              </div>
            </div>

            <textarea
              className="avTextarea"
              placeholder="Provide a detailed description of the vehicle's condition, special features, maintenance history, unique selling points, or any additional information that would be helpful for potential customers..."
            />
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
                  <div className="avPreviewCardSub">{summary.color || 'Color not selected'}</div>
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
                    <Star size={16} />
                  </div>
                  <div className="avPreviewCardLabel">Features &amp; Status</div>
                  <div className="avPreviewCardValue">{featureCount} Features</div>
                  <div className="avPreviewCardMeta">{summary.status}</div>
                  <div className="avPreviewCardSub">Premium amenities included</div>
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
                onCreate?.({
                  name: name.trim() || 'New Vehicle',
                  category,
                  year: Number(year) || 2024,
                  dailyRateQar: Number(dailyRate) || 300,
                  status,
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

