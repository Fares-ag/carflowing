-- Add document fields to customer_profiles for QID and driver's license (rental flow)
alter table customer_profiles
  add column if not exists qid_document_path text,
  add column if not exists drivers_license_path text;

comment on column customer_profiles.qid_document_path is 'Storage path in documents bucket for Qatar ID (e.g. {user_id}/qid.pdf)';
comment on column customer_profiles.drivers_license_path is 'Storage path in documents bucket for driver license (e.g. {user_id}/license.pdf)';

-- Ensure one customer_profile per user for upsert
create unique index if not exists customer_profiles_user_id_key on customer_profiles (user_id);
