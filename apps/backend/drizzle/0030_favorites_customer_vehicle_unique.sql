-- One favorite row per customer/vehicle (idempotent add).
DELETE FROM favorites a USING favorites b
  WHERE a.customer_id = b.customer_id
    AND a.vehicle_id = b.vehicle_id
    AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS favorites_customer_vehicle_uidx
  ON favorites (customer_id, vehicle_id);
