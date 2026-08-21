import type { Rental } from '@carflow/shared'
import { formatDateOrDash } from '@carflow/shared'

type RentalDeliveryPanelProps = {
  rental: Pick<
    Rental,
    | 'pickupLocation'
    | 'pickupDate'
    | 'pickupTime'
    | 'pickupFulfilmentStatus'
    | 'returnLocation'
    | 'returnDate'
    | 'returnTime'
    | 'status'
  >
  onAcknowledge?: (status: 'scheduled' | 'delivered') => void
  acknowledging?: boolean
}

export function RentalDeliveryPanel({
  rental,
  onAcknowledge,
  acknowledging = false,
}: RentalDeliveryPanelProps) {
  const hasPickup = !!(rental.pickupLocation || rental.pickupDate || rental.pickupTime)
  const hasReturn = !!(rental.returnLocation || rental.returnDate || rental.returnTime)

  if (!hasPickup && !hasReturn) {
    return null
  }

  return (
    <div className="rnDeliveryPanel">
      {hasPickup && (
        <div className="rnDeliveryBlock">
          <h4 className="rnDeliveryTitle">Delivery / pickup request</h4>
          <dl className="rnDeliveryFacts">
            {rental.pickupLocation && (
              <>
                <dt>Location</dt>
                <dd>{rental.pickupLocation}</dd>
              </>
            )}
            {rental.pickupDate && (
              <>
                <dt>Date</dt>
                <dd>{formatDateOrDash(rental.pickupDate)}</dd>
              </>
            )}
            {rental.pickupTime && (
              <>
                <dt>Time</dt>
                <dd>{rental.pickupTime}</dd>
              </>
            )}
            {rental.pickupFulfilmentStatus && (
              <>
                <dt>Status</dt>
                <dd className={`rnDeliveryStatus rnDeliveryStatus--${rental.pickupFulfilmentStatus}`}>
                  {rental.pickupFulfilmentStatus === 'delivered' ? 'Delivered' : 'Scheduled'}
                </dd>
              </>
            )}
          </dl>
          {onAcknowledge &&
            (rental.status === 'reserved' || rental.status === 'active') &&
            rental.pickupFulfilmentStatus !== 'delivered' && (
              <div className="rnDeliveryActions">
                {rental.pickupFulfilmentStatus !== 'scheduled' && (
                  <button
                    type="button"
                    className="rnDeliveryBtn"
                    disabled={acknowledging}
                    onClick={() => onAcknowledge('scheduled')}
                  >
                    Mark delivery scheduled
                  </button>
                )}
                <button
                  type="button"
                  className="rnDeliveryBtn rnDeliveryBtn--primary"
                  disabled={acknowledging}
                  onClick={() => onAcknowledge('delivered')}
                >
                  Mark delivered
                </button>
              </div>
            )}
        </div>
      )}
      {hasReturn && (
        <div className="rnDeliveryBlock">
          <h4 className="rnDeliveryTitle">Return / collection (customer request)</h4>
          <dl className="rnDeliveryFacts">
            {rental.returnLocation && (
              <>
                <dt>Location</dt>
                <dd>{rental.returnLocation}</dd>
              </>
            )}
            {rental.returnDate && (
              <>
                <dt>Date</dt>
                <dd>{formatDateOrDash(rental.returnDate)}</dd>
              </>
            )}
            {rental.returnTime && (
              <>
                <dt>Time</dt>
                <dd>{rental.returnTime}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
