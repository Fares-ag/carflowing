-- Dealer responses to customer rental reviews (one per review)
ALTER TABLE rental_reviews
  ADD COLUMN IF NOT EXISTS dealer_response text,
  ADD COLUMN IF NOT EXISTS dealer_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS dealer_responded_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
