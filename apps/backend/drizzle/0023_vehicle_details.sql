ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mileage_cap_km integer;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Keep image_url aligned with the first gallery photo when only image_urls is set.
UPDATE vehicles
SET image_url = image_urls[1]
WHERE image_url IS NULL
  AND array_length(image_urls, 1) > 0;
