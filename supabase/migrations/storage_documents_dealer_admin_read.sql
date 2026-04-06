-- Dealers need SELECT on storage.objects for customer paths ({customer_id}/file) to use
-- createSignedUrl in the dealer app. documents_storage_user_path.sql only allows the
-- object owner; add policies OR'd with that restriction.

drop policy if exists "documents_dealer_select_booking_customer" on storage.objects;
create policy "documents_dealer_select_booking_customer"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.booking_requests br
    join public.vehicles v on v.id = br.vehicle_id
    join public.dealers d on d.id = v.dealer_id
    where br.customer_id::text = (storage.foldername(storage.objects.name))[1]
      and d.owner_user_id = auth.uid()
  )
);

drop policy if exists "documents_admin_select" on storage.objects;
create policy "documents_admin_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documents'
  and coalesce((auth.jwt()->'app_metadata'->>'role'), '') = 'admin'
);
