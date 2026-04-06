-- Add admin delete policy for booking_requests (run if you already applied rls.sql)
-- Run in Supabase SQL Editor

drop policy if exists "booking_requests_admin_delete" on booking_requests;
create policy "booking_requests_admin_delete" on booking_requests
  for delete using (is_admin());
