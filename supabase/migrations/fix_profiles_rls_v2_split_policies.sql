-- Fix persistent 500 on GET /profiles:
-- 1) Role helpers use set_config('row_security','off',true) inside PL/pgSQL (reliable on Supabase Postgres).
-- 2) Split profiles SELECT/UPDATE so "own row" never invokes is_admin() (avoids recursion if helpers misbehave).
-- 3) Split customer_profiles SELECT the same way.
-- Run in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Helpers (read public.profiles without RLS re-entry)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('row_security', 'off', true);
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$;

create or replace function public.is_dealer()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('row_security', 'off', true);
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'dealer'
  );
end;
$$;

create or replace function public.is_customer()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('row_security', 'off', true);
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'customer'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: replace combined policies with split policies
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_self_select" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_select_admin" on public.profiles
  for select using (public.is_admin());

drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin());

-- ---------------------------------------------------------------------------
-- customer_profiles: split SELECT that used (self or admin)
-- ---------------------------------------------------------------------------
drop policy if exists "customer_profiles_self" on public.customer_profiles;
drop policy if exists "customer_profiles_select_own" on public.customer_profiles;
drop policy if exists "customer_profiles_select_admin" on public.customer_profiles;

create policy "customer_profiles_select_own" on public.customer_profiles
  for select using (user_id = auth.uid());

create policy "customer_profiles_select_admin" on public.customer_profiles
  for select using (public.is_admin());
