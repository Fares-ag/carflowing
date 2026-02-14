import { memo, useEffect, useState } from 'react'
import { Modal } from './Modal'
import './EditVehicleModal.css'

export type EditVehicleStatus = 'Available' | 'Rented' | 'Maintenance'

export interface EditVehicleValues {
  vehicleName: string
  fuelType: string
  category: string
  transmission: string
  dailyRate: string
  seatingCapacity: string
  year: string
  color: string
  status: EditVehicleStatus
  licensePlate: string
  description: string
}

export interface EditVehicleModalProps {
  isOpen: boolean
  initialValues: EditVehicleValues
  onClose: () => void
  onSave?: (values: EditVehicleValues) => void
}

export const EditVehicleModal = memo(function EditVehicleModal({
  isOpen,
  initialValues,
  onClose,
  onSave,
}: EditVehicleModalProps) {
  const [values, setValues] = useState<EditVehicleValues>(initialValues)

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  if (!isOpen) return null

  return (
    <Modal title="Edit Vehicle" size="sm" onClose={onClose}>
      <div className="editVehicleModal">
        <div className="evHeader">
          <div className="evTitle">Edit Vehicle</div>
          <div className="evSubtitle">Update vehicle information and settings</div>
        </div>

        <div className="evBody">
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
              <span className="evLabel">Fuel Type</span>
              <select
                className="evSelect"
                value={values.fuelType}
                onChange={(e) => setValues((p) => ({ ...p, fuelType: e.target.value }))}
              >
                <option>Petrol</option>
                <option>Diesel</option>
                <option>Electric</option>
                <option>Hybrid</option>
              </select>
            </label>

            <label className="evField">
              <span className="evLabel">Category</span>
              <select
                className="evSelect"
                value={values.category}
                onChange={(e) => setValues((p) => ({ ...p, category: e.target.value }))}
              >
                <option>SUV</option>
                <option>Sedan</option>
                <option>Hatchback</option>
                <option>Coupe</option>
              </select>
            </label>

            <label className="evField">
              <span className="evLabel">Transmission</span>
              <select
                className="evSelect"
                value={values.transmission}
                onChange={(e) => setValues((p) => ({ ...p, transmission: e.target.value }))}
              >
                <option>Automatic</option>
                <option>Manual</option>
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
              <span className="evLabel">Seating Capacity</span>
              <select
                className="evSelect"
                value={values.seatingCapacity}
                onChange={(e) => setValues((p) => ({ ...p, seatingCapacity: e.target.value }))}
              >
                <option>2 Seats</option>
                <option>4 Seats</option>
                <option>5 Seats</option>
                <option>7 Seats</option>
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
              <span className="evLabel">Color</span>
              <input
                className="evInput"
                value={values.color}
                onChange={(e) => setValues((p) => ({ ...p, color: e.target.value }))}
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

            <label className="evField">
              <span className="evLabel">License Plate</span>
              <input
                className="evInput"
                value={values.licensePlate}
                onChange={(e) => setValues((p) => ({ ...p, licensePlate: e.target.value }))}
              />
            </label>
          </div>

          <label className="evField evFieldFull">
            <span className="evLabel">Description</span>
            <textarea
              className="evTextarea"
              value={values.description}
              onChange={(e) => setValues((p) => ({ ...p, description: e.target.value }))}
            />
          </label>
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

