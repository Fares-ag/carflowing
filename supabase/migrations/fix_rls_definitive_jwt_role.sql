-- ==========================================================================
-- DEFINITIVE FIX for 500 on GET /profiles (RLS infinite recursion)
--
-- Root cause: is_admin()/is_dealer()/is_customer() read from `profiles`,
-- which has RLS policies that call those same helpers → infinite loop.
--
-- Fix: store role in auth.users.raw_app_meta_data, read via auth.jwt().
-- JWT reads are instant (no table access) → zero recursion possible.
--
-- Run this ONCE in Supabase SQL Editor.
-- ==========================================================================

-- 1) Trigger: keep auth.users.raw_app_meta_data.role in sync with profiles.role
-- ---------------------------------------------------------------------------
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

-- 2) Backfill: write current role into raw_app_meta_data for every existing user
-- ---------------------------------------------------------------------------
update auth.users u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role::text)
from public.profiles p
where p.id = u.id;

-- 3) Rewrite helpers — read from JWT, never touch profiles
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin';
$$;

create or replace function public.is_dealer()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'dealer';
$$;

create or replace function public.is_customer()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'customer';
$$;

-- 4) Rebuild profiles policies (split own-row vs admin, no recursion)
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_self_select"    on public.profiles;
drop policy if exists "profiles_select_own"     on public.profiles;
drop policy if exists "profiles_select_admin"   on public.profiles;
drop policy if exists "profiles_self_update"    on public.profiles;
drop policy if exists "profiles_update_own"     on public.profiles;
drop policy if exists "profiles_update_admin"   on public.profiles;
drop policy if exists "profiles_admin_all"      on public.profiles;

create policy "profiles_select_own"   on public.profiles for select using (id = auth.uid());
create policy "profiles_select_admin" on public.profiles for select using (is_admin());
create policy "profiles_update_own"   on public.profiles for update using (id = auth.uid());
create policy "profiles_update_admin" on public.profiles for update using (is_admin());
create policy "profiles_admin_all"    on public.profiles for all using (is_admin()) with check (is_admin());

-- dealer booking select stays unchanged (doesn't call is_admin)
-- profiles_dealer_booking_select — no change needed

-- 5) Rebuild customer_profiles SELECT policies
-- ---------------------------------------------------------------------------
drop policy if exists "customer_profiles_self"          on public.customer_profiles;
drop policy if exists "customer_profiles_select_own"    on public.customer_profiles;
drop policy if exists "customer_profiles_select_admin"  on public.customer_profiles;

create policy "customer_profiles_select_own"   on public.customer_profiles for select using (user_id = auth.uid());
create policy "customer_profiles_select_admin" on public.customer_profiles for select using (is_admin());
-- admin_all and dealer_booking_select remain unchanged
