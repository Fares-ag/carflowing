-- Row Level Security policies for CarFlow
--
-- Role helpers read from auth.jwt() (no table access → no recursion).
-- A trigger on profiles keeps auth.users.raw_app_meta_data.role in sync.

-- Sync trigger (SECURITY DEFINER so it can write auth.users)
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

-- Role helpers — JWT only, zero table reads
create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin';
$$;

create or replace function is_dealer()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'dealer';
$$;

create or replace function is_customer()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'customer';
$$;

-- Cross-table RLS helpers (SECURITY DEFINER bypasses RLS → no recursion)
create or replace function public.profile_has_booking_with_dealer_owner(
  p_profile_id uuid, p_dealer_owner_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.booking_requests br
    join public.vehicles v on v.id = br.vehicle_id
    join public.dealers  d on d.id = v.dealer_id
    where br.customer_id  = p_profile_id
      and d.owner_user_id = p_dealer_owner_id
  );
$$;

create or replace function public.customer_has_booking_with_dealer_owner(
  p_user_id uuid, p_dealer_owner_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.booking_requests br
    join public.vehicles v on v.id = br.vehicle_id
    join public.dealers  d on d.id = v.dealer_id
    where br.customer_id  = p_user_id
      and d.owner_user_id = p_dealer_owner_id
  );
$$;

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

alter table profiles enable row level security;
drop policy if exists "profiles_self_select" on profiles;
drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_select_admin" on profiles;
create policy "profiles_select_own" on profiles
  for select using (id = auth.uid());
create policy "profiles_select_admin" on profiles
  for select using (is_admin());
drop policy if exists "profiles_self_update" on profiles;
drop policy if exists "profiles_update_own" on profiles;
drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid());
create policy "profiles_update_admin" on profiles
  for update using (is_admin());
drop policy if exists "profiles_admin_all" on profiles;
create policy "profiles_admin_all" on profiles
  for all using (is_admin()) with check (is_admin());
drop policy if exists "profiles_dealer_booking_select" on profiles;
create policy "profiles_dealer_booking_select" on profiles
  for select using (
    profile_has_booking_with_dealer_owner(id, auth.uid())
  );

alter table customer_profiles enable row level security;
drop policy if exists "customer_profiles_self" on customer_profiles;
drop policy if exists "customer_profiles_select_own" on customer_profiles;
drop policy if exists "customer_profiles_select_admin" on customer_profiles;
create policy "customer_profiles_select_own" on customer_profiles
  for select using (user_id = auth.uid());
create policy "customer_profiles_select_admin" on customer_profiles
  for select using (is_admin());
drop policy if exists "customer_profiles_admin_all" on customer_profiles;
create policy "customer_profiles_admin_all" on customer_profiles
  for all using (is_admin()) with check (is_admin());
drop policy if exists "customer_profiles_dealer_booking_select" on customer_profiles;
create policy "customer_profiles_dealer_booking_select" on customer_profiles
  for select using (
    customer_has_booking_with_dealer_owner(user_id, auth.uid())
  );
-- Own-row insert/update (e.g. document paths at checkout) — was in customer_profiles_self_insert.sql
drop policy if exists "customer_profiles_self_insert" on customer_profiles;
create policy "customer_profiles_self_insert" on customer_profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());
drop policy if exists "customer_profiles_self_update" on customer_profiles;
create policy "customer_profiles_self_update" on customer_profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table dealers enable row level security;
drop policy if exists "dealers_owner_select" on dealers;
create policy "dealers_owner_select" on dealers
  for select using (owner_user_id = auth.uid() or is_admin());
drop policy if exists "dealers_booking_customer_select" on dealers;
create policy "dealers_booking_customer_select" on dealers
  for select using (
    dealer_has_booking_with_customer(id, auth.uid())
  );
drop policy if exists "dealers_owner_update" on dealers;
create policy "dealers_owner_update" on dealers
  for update using (owner_user_id = auth.uid() or is_admin());
drop policy if exists "dealers_admin_all" on dealers;
create policy "dealers_admin_all" on dealers
  for all using (is_admin()) with check (is_admin());

alter table vehicles enable row level security;
drop policy if exists "vehicles_public_select" on vehicles;
create policy "vehicles_public_select" on vehicles
  for select using (true);
drop policy if exists "vehicles_dealer_write" on vehicles;
create policy "vehicles_dealer_write" on vehicles
  for insert with check (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
drop policy if exists "vehicles_dealer_update" on vehicles;
create policy "vehicles_dealer_update" on vehicles
  for update using (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
drop policy if exists "vehicles_dealer_delete" on vehicles;
create policy "vehicles_dealer_delete" on vehicles
  for delete using (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );

alter table rentals enable row level security;
drop policy if exists "rentals_customer_select" on rentals;
create policy "rentals_customer_select" on rentals
  for select using (
    is_admin()
    or customer_id = auth.uid()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
drop policy if exists "rentals_customer_write" on rentals;
create policy "rentals_customer_write" on rentals
  for insert with check (
    is_admin()
    or customer_id = auth.uid()
  );
drop policy if exists "rentals_admin_update" on rentals;
create policy "rentals_admin_update" on rentals
  for update using (
    is_admin()
    or customer_id = auth.uid()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );

alter table payments enable row level security;
drop policy if exists "payments_view" on payments;
create policy "payments_view" on payments
  for select using (
    is_admin()
    or customer_id = auth.uid()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
drop policy if exists "payments_admin_write" on payments;
create policy "payments_admin_write" on payments
  for insert with check (is_admin());
drop policy if exists "payments_dealer_insert_offline" on payments;
create policy "payments_dealer_insert_offline" on payments
  for insert
  to authenticated
  with check (
    dealer_id in (select id from dealers where owner_user_id = auth.uid())
    and rental_id is not null
    and amount > 0
    and status = 'completed'
    and type = 'rental'
    and exists (
      select 1 from rentals r
      where r.id = rental_id
        and r.dealer_id = dealer_id
        and r.customer_id = customer_id
    )
  );
drop policy if exists "payments_admin_update" on payments;
create policy "payments_admin_update" on payments
  for update using (is_admin());

alter table plans enable row level security;
drop policy if exists "plans_public_select" on plans;
create policy "plans_public_select" on plans
  for select using (true);
drop policy if exists "plans_admin_write" on plans;
create policy "plans_admin_write" on plans
  for all using (is_admin()) with check (is_admin());

alter table subscriptions enable row level security;
drop policy if exists "subscriptions_owner_select" on subscriptions;
create policy "subscriptions_owner_select" on subscriptions
  for select using (
    is_admin()
    or owner_id = auth.uid()
  );
drop policy if exists "subscriptions_admin_write" on subscriptions;
create policy "subscriptions_admin_write" on subscriptions
  for all using (is_admin()) with check (is_admin());

alter table invoices enable row level security;
drop policy if exists "invoices_owner_select" on invoices;
create policy "invoices_owner_select" on invoices
  for select using (
    is_admin()
    or owner_id = auth.uid()
  );
drop policy if exists "invoices_admin_write" on invoices;
create policy "invoices_admin_write" on invoices
  for all using (is_admin()) with check (is_admin());

alter table booking_requests enable row level security;
drop policy if exists "booking_requests_customer_select" on booking_requests;
create policy "booking_requests_customer_select" on booking_requests
  for select using (
    is_admin()
    or customer_id = auth.uid()
  );
drop policy if exists "booking_requests_customer_write" on booking_requests;
create policy "booking_requests_customer_write" on booking_requests
  for insert with check (
    is_admin()
    or customer_id = auth.uid()
  );
drop policy if exists "booking_requests_dealer_select" on booking_requests;
create policy "booking_requests_dealer_select" on booking_requests
  for select using (
    vehicle_belongs_to_user_dealer(vehicle_id, auth.uid())
  );
drop policy if exists "booking_requests_dealer_update" on booking_requests;
create policy "booking_requests_dealer_update" on booking_requests
  for update using (
    vehicle_belongs_to_user_dealer(vehicle_id, auth.uid())
  );
drop policy if exists "booking_requests_admin_update" on booking_requests;
create policy "booking_requests_admin_update" on booking_requests
  for update using (is_admin());
drop policy if exists "booking_requests_admin_delete" on booking_requests;
create policy "booking_requests_admin_delete" on booking_requests
  for delete using (is_admin());

alter table favorites enable row level security;
drop policy if exists "favorites_customer_select" on favorites;
create policy "favorites_customer_select" on favorites
  for select using (
    is_admin()
    or customer_id = auth.uid()
  );
drop policy if exists "favorites_customer_write" on favorites;
create policy "favorites_customer_write" on favorites
  for insert with check (
    is_admin()
    or customer_id = auth.uid()
  );
drop policy if exists "favorites_customer_delete" on favorites;
create policy "favorites_customer_delete" on favorites
  for delete using (
    is_admin()
    or customer_id = auth.uid()
  );

alter table complaints enable row level security;
drop policy if exists "complaints_customer_select" on complaints;
create policy "complaints_customer_select" on complaints
  for select using (
    is_admin()
    or customer_id = auth.uid()
  );
drop policy if exists "complaints_customer_write" on complaints;
create policy "complaints_customer_write" on complaints
  for insert with check (
    is_admin()
    or customer_id = auth.uid()
  );
drop policy if exists "complaints_admin_update" on complaints;
create policy "complaints_admin_update" on complaints
  for update using (is_admin());

alter table messages enable row level security;
drop policy if exists "messages_participant_select" on messages;
create policy "messages_participant_select" on messages
  for select using (
    is_admin()
    or from_user_id = auth.uid()
    or to_user_id = auth.uid()
  );
drop policy if exists "messages_participant_write" on messages;
create policy "messages_participant_write" on messages
  for insert with check (
    is_admin()
    or from_user_id = auth.uid()
  );
drop policy if exists "messages_participant_update" on messages;
create policy "messages_participant_update" on messages
  for update using (
    is_admin()
    or from_user_id = auth.uid()
    or to_user_id = auth.uid()
  );

alter table notifications enable row level security;
drop policy if exists "notifications_owner_select" on notifications;
create policy "notifications_owner_select" on notifications
  for select using (
    is_admin()
    or user_id = auth.uid()
  );
drop policy if exists "notifications_owner_update" on notifications;
create policy "notifications_owner_update" on notifications
  for update using (
    is_admin()
    or user_id = auth.uid()
  );
drop policy if exists "notifications_admin_write" on notifications;
create policy "notifications_admin_write" on notifications
  for insert with check (is_admin());

alter table leads enable row level security;
drop policy if exists "leads_dealer_select" on leads;
create policy "leads_dealer_select" on leads
  for select using (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
drop policy if exists "leads_dealer_write" on leads;
create policy "leads_dealer_write" on leads
  for insert with check (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
drop policy if exists "leads_dealer_update" on leads;
create policy "leads_dealer_update" on leads
  for update using (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
drop policy if exists "leads_dealer_delete" on leads;
create policy "leads_dealer_delete" on leads
  for delete using (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );

alter table payment_methods enable row level security;
drop policy if exists "payment_methods_owner_select" on payment_methods;
create policy "payment_methods_owner_select" on payment_methods
  for select using (
    is_admin()
    or user_id = auth.uid()
  );
drop policy if exists "payment_methods_owner_write" on payment_methods;
create policy "payment_methods_owner_write" on payment_methods
  for insert with check (
    is_admin()
    or user_id = auth.uid()
  );
drop policy if exists "payment_methods_owner_update" on payment_methods;
create policy "payment_methods_owner_update" on payment_methods
  for update using (
    is_admin()
    or user_id = auth.uid()
  );
drop policy if exists "payment_methods_owner_delete" on payment_methods;
create policy "payment_methods_owner_delete" on payment_methods
  for delete using (
    is_admin()
    or user_id = auth.uid()
  );

alter table app_settings enable row level security;
drop policy if exists "app_settings_admin_select" on app_settings;
create policy "app_settings_admin_select" on app_settings
  for select using (is_admin());
drop policy if exists "app_settings_admin_write" on app_settings;
create policy "app_settings_admin_write" on app_settings
  for all using (is_admin()) with check (is_admin());
