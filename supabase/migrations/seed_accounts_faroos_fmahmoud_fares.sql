-- Demo accounts for CarFlow — run in Supabase Dashboard → SQL → New query.
-- Password for all three: password123
--
--   faroos4848@gmail.com   → customer
--   fmahmoud@q-auto.com    → admin
--   fares@carflow.com      → dealer (+ dealers row for portal)
--
-- Prerequisites: pgcrypto; schema + trigger that inserts public.profiles on auth.users insert.
-- If any INSERT fails (e.g. auth.identities columns differ by Supabase version), create the user
-- under Authentication → Users → Add user, then run only the UPDATE/INSERT sections at the bottom.
--
-- If login returns 400 / "Invalid login credentials", run repair_seed_users_auth_login.sql next.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) faroos4848@gmail.com — customer
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid := gen_random_uuid();
  v_pw text := crypt('password123', gen_salt('bf'));
begin
  if exists (select 1 from auth.users where email = 'faroos4848@gmail.com') then
    return;
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'faroos4848@gmail.com',
    v_pw,
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    v_id,
    v_id,
    jsonb_build_object('sub', v_id::text, 'email', 'faroos4848@gmail.com'),
    'email',
    v_id::text,
    now(),
    now(),
    now()
  );
end $$;

-- ---------------------------------------------------------------------------
-- 2) fmahmoud@q-auto.com — admin
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid := gen_random_uuid();
  v_pw text := crypt('password123', gen_salt('bf'));
begin
  if exists (select 1 from auth.users where email = 'fmahmoud@q-auto.com') then
    return;
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fmahmoud@q-auto.com',
    v_pw,
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    v_id,
    v_id,
    jsonb_build_object('sub', v_id::text, 'email', 'fmahmoud@q-auto.com'),
    'email',
    v_id::text,
    now(),
    now(),
    now()
  );
end $$;

-- ---------------------------------------------------------------------------
-- 3) fares@carflow.com — dealer
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid := gen_random_uuid();
  v_pw text := crypt('password123', gen_salt('bf'));
begin
  if exists (select 1 from auth.users where email = 'fares@carflow.com') then
    return;
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'fares@carflow.com',
    v_pw,
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    v_id,
    v_id,
    jsonb_build_object('sub', v_id::text, 'email', 'fares@carflow.com'),
    'email',
    v_id::text,
    now(),
    now(),
    now()
  );
end $$;

-- ---------------------------------------------------------------------------
-- App profiles + dealer row (safe to re-run)
-- ---------------------------------------------------------------------------
update public.profiles
set role = 'customer', status = 'active'
where email = 'faroos4848@gmail.com';

update public.profiles
set role = 'admin', status = 'active'
where email = 'fmahmoud@q-auto.com';

update public.profiles
set role = 'dealer', status = 'active'
where email = 'fares@carflow.com';

insert into public.dealers (name, owner_user_id, status, contact_email, plan_id)
select
  'Carflow Dealer',
  p.id,
  'active',
  p.email,
  (select id from public.plans where tier = 'starter' limit 1)
from public.profiles p
where p.email = 'fares@carflow.com'
  and p.role = 'dealer'
  and not exists (select 1 from public.dealers d where d.owner_user_id = p.id);

insert into public.subscriptions (owner_id, owner_type, plan_id, status, start_date, usage)
select
  p.id,
  'dealer'::public.subscription_owner_type,
  d.plan_id,
  'active',
  current_date,
  jsonb_build_object('rentals', 0, 'listings', 0, 'messages', 0)
from public.profiles p
join public.dealers d on d.owner_user_id = p.id
where p.email = 'fares@carflow.com'
  and not exists (
    select 1 from public.subscriptions s
    where s.owner_id = p.id and s.owner_type = 'dealer'
  );
