-- Fix infinite recursion: dealers_booking_customer_select triggers booking_requests RLS,
-- which queries dealers again. Use a SECURITY DEFINER helper to break the cycle.

create or replace function public.dealer_has_booking_with_customer(p_dealer_id uuid, p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.booking_requests br
    join public.vehicles v on v.id = br.vehicle_id and v.dealer_id = p_dealer_id
    where br.customer_id = p_customer_id
  );
$$;

drop policy if exists "dealers_booking_customer_select" on dealers;
create policy "dealers_booking_customer_select" on dealers
  for select using (
    dealer_has_booking_with_customer(id, auth.uid())
  );
