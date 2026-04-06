-- Run in Supabase SQL Editor if seed users get 400 on signInWithPassword / "Invalid login credentials".
-- Re-hashes password with pgcrypto and forces confirmed email.
-- Also backfills auth.identities when missing (email provider).

create extension if not exists pgcrypto;

-- 1) Refresh password + confirmation on existing seed users
update auth.users
set
  encrypted_password = crypt('password123', gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where email in (
  'faroos4848@gmail.com',
  'fmahmoud@q-auto.com',
  'fares@carflow.com'
);

-- 2) Ensure email identity exists (GoTrue needs this row for password sign-in on many versions)
insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  u.id,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  now(),
  now(),
  now()
from auth.users u
where u.email in (
  'faroos4848@gmail.com',
  'fmahmoud@q-auto.com',
  'fares@carflow.com'
)
and not exists (
  select 1
  from auth.identities i
  where i.user_id = u.id and i.provider = 'email'
);
