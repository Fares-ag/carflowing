ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS location_city text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS location_area text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS longitude numeric;

CREATE INDEX IF NOT EXISTS vehicles_location_city_idx ON vehicles (location_city);
