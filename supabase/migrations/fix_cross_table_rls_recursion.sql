-- ==========================================================================
-- FIX: 500 on GET /profiles — cross-table RLS infinite recursion
--
-- Cycle: profiles_dealer_booking_select → booking_requests (RLS)
--        → booking_requests_dealer_select → dealers (RLS)
--        → dealers_booking_customer_select → booking_requests (RLS) → loop
--
-- Fix: wrap every cross-table RLS subquery in a SECURITY DEFINER function.
-- SECURITY DEFINER runs as the function owner (postgres), which bypasses
-- RLS on the tables it reads, breaking the recursion chain.
--
-- Also ensures JWT-based role helpers + backfill are in place.
-- Run this ONCE in the Supabase SQL Editor.
-- ==========================================================================

-- 1) Sync trigger — keeps auth.users.raw_app_meta_data.role in sync
-- -------------------------------------------------------------------------
create or replace function public.sync_role_to_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role::text)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_profile_role_change on public.profiles;
create trigger on_profile_role_change
  after insert or update of role on public.profiles
  for each row execute function public.sync_role_to_auth_metadata();

-- 2) Backfill raw_app_meta_data.role for every existing user
-- -------------------------------------------------------------------------
update auth.users u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role::text)
from public.profiles p
where p.id = u.id;

-- 3) JWT-based role helpers — zero table reads, zero recursion
-- -------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin';
$$;

create or replace function public.is_dealer()
returns boolean language sql stable as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'dealer';
$$;

create or replace function public.is_customer()
returns boolean language sql stable as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'customer';
$$;

-- 4) SECURITY DEFINER helpers — bypass RLS to break cross-table cycles
-- -------------------------------------------------------------------------

-- Used by: profiles_dealer_booking_select
create or replace function public.profile_has_booking_with_dealer_owner(
  p_profile_id uuid, p_dealer_owner_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.booking_requests br
    join public.vehicles v on v.id = br.vehicle_id
    join public.dealers  d on d.id = v.dealer_id
    where br.customer_id    = p_profile_id
      and d.owner_user_id   = p_dealer_owner_id
  );
$$;

-- Used by: customer_profiles_dealer_booking_select
create or replace function public.customer_has_booking_with_dealer_owner(
  p_user_id uuid, p_dealer_owner_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.booking_requests br
    join public.vehicles v on v.id = br.vehicle_id
    join public.dealers  d on d.id = v.dealer_id
    where br.customer_id    = p_user_id
      and d.owner_user_id   = p_dealer_owner_id
  );
$$;

-- Used by: dealers_booking_customer_select
create or replace function public.dealer_has_booking_with_customer(
  p_dealer_id uuid, p_customer_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.booking_requests br
    join public.vehicles v on v.id = br.vehicle_id and v.dealer_id = p_dealer_id
    where br.customer_id = p_customer_id
  );
$$;

-- Used by: booking_requests_dealer_select, booking_requests_dealer_update
create or replace function public.vehicle_belongs_to_user_dealer(
  p_vehicle_id uuid, p_user_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.vehicles v
    join public.dealers  d on d.id = v.dealer_id
    where v.id = p_vehicle_id and d.owner_user_id = p_user_id
  );
$$;

-- 5) Rebuild cross-referencing policies using the helpers above
-- -------------------------------------------------------------------------

-- profiles: dealer can see customer profiles tied to their bookings
drop policy if exists "profiles_dealer_booking_select" on public.profiles;
create policy "profiles_dealer_booking_select" on public.profiles
  for select using (
    public.profile_has_booking_with_dealer_owner(id, auth.uid())
  );

-- customer_profiles: same pattern
drop policy if exists "customer_profiles_dealer_booking_select" on public.customer_profiles;
create policy "customer_profiles_dealer_booking_select" on public.customer_profiles
  for select using (
    public.customer_has_booking_with_dealer_owner(user_id, auth.uid())
  );

-- dealers: customer can see dealer info for their bookings
drop policy if exists "dealers_booking_customer_select" on public.dealers;
create policy "dealers_booking_customer_select" on public.dealers
  for select using (
    public.dealer_has_booking_with_customer(id, auth.uid())
  );

-- booking_requests: dealer can see/update requests for their vehicles
drop policy if exists "booking_requests_dealer_select" on public.booking_requests;
create policy "booking_requests_dealer_select" on public.booking_requests
  for select using (
    public.vehicle_belongs_to_user_dealer(vehicle_id, auth.uid())
  );

drop policy if exists "booking_requests_dealer_update" on public.booking_requests;
create policy "booking_requests_dealer_update" on public.booking_requests
  for update using (
    public.vehicle_belongs_to_user_dealer(vehicle_id, auth.uid())
  );
