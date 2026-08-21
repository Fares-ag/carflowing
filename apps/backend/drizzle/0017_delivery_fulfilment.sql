ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_fulfilment_status text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_location text;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_date date;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_time text;
