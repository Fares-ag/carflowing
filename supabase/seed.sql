-- Seed data for CarFlow (run after creating auth users)

-- Example: create profiles for existing auth users
insert into profiles (id, email, name, role, status)
select id, email, split_part(email, '@', 1), 'admin', 'active'
from auth.users
where email = 'admin@carflow.dev'
on conflict do nothing;

insert into profiles (id, email, name, role, status)
select id, email, split_part(email, '@', 1), 'dealer', 'active'
from auth.users
where email = 'dealer@carflow.dev'
on conflict do nothing;

insert into profiles (id, email, name, role, status)
select id, email, split_part(email, '@', 1), 'customer', 'active'
from auth.users
where email = 'customer@carflow.dev'
on conflict do nothing;

-- Create a starter plan
insert into plans (name, tier, status, price_monthly, price_yearly, features)
values ('Starter', 'starter', 'active', 99, 999, array['Up to 10 listings', 'Email support'])
on conflict do nothing;

-- Create a dealer linked to the dealer profile
insert into dealers (name, owner_user_id, status, plan_id, rating, total_revenue, active_rentals, vehicles_count, contact_email)
select
  'Prime Auto Group',
  p.id,
  'active',
  (select id from plans where tier = 'starter' limit 1),
  4.6,
  12000,
  2,
  3,
  p.email
from profiles p
where p.role = 'dealer'
limit 1
on conflict do nothing;
