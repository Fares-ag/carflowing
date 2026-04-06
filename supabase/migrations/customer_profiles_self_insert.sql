-- Allow customers to insert/update their own customer_profiles row (e.g. document upload at checkout)
-- Same policies live in supabase/rls.sql; for DBs missing them only, see ensure_customer_profiles_insert_update_policies.sql
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
