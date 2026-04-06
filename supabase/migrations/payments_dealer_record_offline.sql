-- Allow dealers to record offline / out-of-platform payments for their own rentals.
-- Inserts must reference a rental owned by the same dealer and matching customer_id.

drop policy if exists "payments_dealer_insert_offline" on public.payments;
create policy "payments_dealer_insert_offline"
on public.payments for insert
to authenticated
with check (
  dealer_id in (select id from public.dealers where owner_user_id = auth.uid())
  and rental_id is not null
  and amount > 0
  and status = 'completed'
  and type = 'rental'
  and exists (
    select 1 from public.rentals r
    where r.id = rental_id
      and r.dealer_id = dealer_id
      and r.customer_id = customer_id
  )
);
