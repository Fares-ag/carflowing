-- If GET /profiles works but document upload fails with RLS on INSERT,
-- run this in Supabase SQL Editor (policies are also in supabase/rls.sql).
drop policy if exists "customer_profiles_self_insert" on public.customer_profiles;
create policy "customer_profiles_self_insert" on public.customer_profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "customer_profiles_self_update" on public.customer_profiles;
create policy "customer_profiles_self_update" on public.customer_profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
