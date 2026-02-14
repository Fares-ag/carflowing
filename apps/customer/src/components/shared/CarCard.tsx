import { Bolt, MapPin, Settings2, Star, Users, X } from 'lucide-react'
import './CarCard.css'

interface CarCardProps {
  id: string
  name: string
  type: string
  price: number
  rating: number
  reviews: number
  seats: number
  transmission: string
  fuelType: string
  image?: string
  isPopular?: boolean
  isElectric?: boolean
  onConfigure?: () => void
  onFavorite?: () => void
  onRemove?: () => void
  pricePeriod?: 'month' | 'day'
  location?: string
}

export function CarCard({
  name,
  type,
  price,
  rating,
  reviews,
  seats,
  transmission,
  fuelType,
  image,
  isPopular = false,
  isElectric = false,
  onConfigure,
  onFavorite,
  onRemove,
  pricePeriod = 'month',
  location,
}: CarCardProps) {
  return (
    <div className="car-card">
      <div className="car-card-image">
        {image ? (
          <img src={image} alt={name} />
        ) : (
          <div className="car-image-placeholder">{name}</div>
        )}
        {isPopular && (
          <div className="popular-badge">Popular</div>
        )}
      </div>
      
      <div className="car-card-content">
        <div className="car-card-header">
          <span className="car-type-badge">{type}</span>
          <div className="car-features">
            {isElectric && (
              <div className="feature-item">
                <Bolt size={14} />
                <span>electric</span>
              </div>
            )}
            <div className="feature-item">
              <Star size={11} />
              <span>{rating}</span>
            </div>
          </div>
        </div>
        
        <h3 className="car-name">{name}</h3>
        
        {location && (
          <div className="car-location">
            <MapPin size={14} />
            <span>{location}</span>
          </div>
        )}
        
        <div className="car-specs">
          <div className="spec-item">
            <Users size={14} />
            <span>{seats} seats</span>
          </div>
          <div className="spec-item">
            <Settings2 size={14} />
            <span>{transmission}</span>
          </div>
        </div>
        
        <div className="car-card-footer">
          <div className="car-price">
            <div className="price-amount">QAR {price.toLocaleString()}</div>
            <div className="price-period">per {pricePeriod}</div>
          </div>
          <div className="car-actions">
            <button className="icon-button-small" type="button" onClick={onFavorite} aria-label="Save to favorites">
              <Star size={14} />
            </button>
            {onRemove && (
              <button className="icon-button-small" type="button" onClick={onRemove} aria-label="Remove favorite">
                <X size={14} />
              </button>
            )}
            <button className="configure-button" type="button" onClick={onConfigure}>
              Configure
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

