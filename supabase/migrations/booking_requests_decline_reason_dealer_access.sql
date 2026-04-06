-- Decline reason (shown to customer when dealer rejects)
-- Dealers can read customer profile + documents for bookings on their vehicles

alter table public.booking_requests
  add column if not exists decline_reason text;

comment on column public.booking_requests.decline_reason is
  'Explanation shown to the customer when status is declined. Cleared when approved.';

-- customer_profiles: dealer may read rows for customers with any booking on their inventory
drop policy if exists "customer_profiles_dealer_booking_select" on public.customer_profiles;
create policy "customer_profiles_dealer_booking_select" on public.customer_profiles
  for select using (
    exists (
      select 1 from public.booking_requests br
      join public.vehicles v on v.id = br.vehicle_id
      join public.dealers d on d.id = v.dealer_id
      where br.customer_id = customer_profiles.user_id
        and d.owner_user_id = auth.uid()
    )
  );

-- profiles: dealer may read name/email for customers who booked their vehicles
drop policy if exists "profiles_dealer_booking_select" on public.profiles;
create policy "profiles_dealer_booking_select" on public.profiles
  for select using (
    exists (
      select 1 from public.booking_requests br
      join public.vehicles v on v.id = br.vehicle_id
      join public.dealers d on d.id = v.dealer_id
      where br.customer_id = profiles.id
        and d.owner_user_id = auth.uid()
    )
  );
