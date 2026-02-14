-- Row Level Security policies for CarFlow

create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function is_dealer()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'dealer'
  );
$$;

create or replace function is_customer()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'customer'
  );
$$;

alter table profiles enable row level security;
create policy "profiles_self_select" on profiles
  for select using (id = auth.uid() or is_admin());
create policy "profiles_self_update" on profiles
  for update using (id = auth.uid() or is_admin());
create policy "profiles_admin_all" on profiles
  for all using (is_admin()) with check (is_admin());

alter table customer_profiles enable row level security;
create policy "customer_profiles_self" on customer_profiles
  for select using (user_id = auth.uid() or is_admin());
create policy "customer_profiles_admin_all" on customer_profiles
  for all using (is_admin()) with check (is_admin());

alter table dealers enable row level security;
create policy "dealers_owner_select" on dealers
  for select using (owner_user_id = auth.uid() or is_admin());
create policy "dealers_owner_update" on dealers
  for update using (owner_user_id = auth.uid() or is_admin());
create policy "dealers_admin_all" on dealers
  for all using (is_admin()) with check (is_admin());

alter table vehicles enable row level security;
create policy "vehicles_public_select" on vehicles
  for select using (true);
create policy "vehicles_dealer_write" on vehicles
  for insert with check (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
create policy "vehicles_dealer_update" on vehicles
  for update using (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
create policy "vehicles_dealer_delete" on vehicles
  for delete using (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );

alter table rentals enable row level security;
create policy "rentals_customer_select" on rentals
  for select using (
    is_admin()
    or customer_id = auth.uid()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
create policy "rentals_customer_write" on rentals
  for insert with check (
    is_admin()
    or customer_id = auth.uid()
  );
create policy "rentals_admin_update" on rentals
  for update using (
    is_admin()
    or customer_id = auth.uid()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );

alter table payments enable row level security;
create policy "payments_view" on payments
  for select using (
    is_admin()
    or customer_id = auth.uid()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
create policy "payments_admin_write" on payments
  for insert with check (is_admin());
create policy "payments_admin_update" on payments
  for update using (is_admin());

alter table plans enable row level security;
create policy "plans_public_select" on plans
  for select using (true);
create policy "plans_admin_write" on plans
  for all using (is_admin()) with check (is_admin());

alter table subscriptions enable row level security;
create policy "subscriptions_owner_select" on subscriptions
  for select using (
    is_admin()
    or owner_id = auth.uid()
  );
create policy "subscriptions_admin_write" on subscriptions
  for all using (is_admin()) with check (is_admin());

alter table invoices enable row level security;
create policy "invoices_owner_select" on invoices
  for select using (
    is_admin()
    or owner_id = auth.uid()
  );
create policy "invoices_admin_write" on invoices
  for all using (is_admin()) with check (is_admin());

alter table booking_requests enable row level security;
create policy "booking_requests_customer_select" on booking_requests
  for select using (
    is_admin()
    or customer_id = auth.uid()
  );
create policy "booking_requests_customer_write" on booking_requests
  for insert with check (
    is_admin()
    or customer_id = auth.uid()
  );
create policy "booking_requests_admin_update" on booking_requests
  for update using (is_admin());

alter table favorites enable row level security;
create policy "favorites_customer_select" on favorites
  for select using (
    is_admin()
    or customer_id = auth.uid()
  );
create policy "favorites_customer_write" on favorites
  for insert with check (
    is_admin()
    or customer_id = auth.uid()
  );
create policy "favorites_customer_delete" on favorites
  for delete using (
    is_admin()
    or customer_id = auth.uid()
  );

alter table complaints enable row level security;
create policy "complaints_customer_select" on complaints
  for select using (
    is_admin()
    or customer_id = auth.uid()
  );
create policy "complaints_customer_write" on complaints
  for insert with check (
    is_admin()
    or customer_id = auth.uid()
  );
create policy "complaints_admin_update" on complaints
  for update using (is_admin());

alter table messages enable row level security;
create policy "messages_participant_select" on messages
  for select using (
    is_admin()
    or from_user_id = auth.uid()
    or to_user_id = auth.uid()
  );
create policy "messages_participant_write" on messages
  for insert with check (
    is_admin()
    or from_user_id = auth.uid()
  );
create policy "messages_participant_update" on messages
  for update using (
    is_admin()
    or from_user_id = auth.uid()
    or to_user_id = auth.uid()
  );

alter table notifications enable row level security;
create policy "notifications_owner_select" on notifications
  for select using (
    is_admin()
    or user_id = auth.uid()
  );
create policy "notifications_owner_update" on notifications
  for update using (
    is_admin()
    or user_id = auth.uid()
  );
create policy "notifications_admin_write" on notifications
  for insert with check (is_admin());

alter table leads enable row level security;
create policy "leads_dealer_select" on leads
  for select using (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
create policy "leads_dealer_write" on leads
  for insert with check (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
create policy "leads_dealer_update" on leads
  for update using (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );
create policy "leads_dealer_delete" on leads
  for delete using (
    is_admin()
    or dealer_id in (select id from dealers where owner_user_id = auth.uid())
  );

alter table payment_methods enable row level security;
create policy "payment_methods_owner_select" on payment_methods
  for select using (
    is_admin()
    or user_id = auth.uid()
  );
create policy "payment_methods_owner_write" on payment_methods
  for insert with check (
    is_admin()
    or user_id = auth.uid()
  );
create policy "payment_methods_owner_update" on payment_methods
  for update using (
    is_admin()
    or user_id = auth.uid()
  );
create policy "payment_methods_owner_delete" on payment_methods
  for delete using (
    is_admin()
    or user_id = auth.uid()
  );

alter table app_settings enable row level security;
create policy "app_settings_admin_select" on app_settings
  for select using (is_admin());
create policy "app_settings_admin_write" on app_settings
  for all using (is_admin()) with check (is_admin());
