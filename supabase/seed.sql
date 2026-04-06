-- Seed data for CarFlow (run after creating auth users in Supabase Auth)
-- Create users first: Authentication → Users → Add user
-- Recommended: admin@carflow.dev, dealer@carflow.dev, customer@carflow.dev

-- Create/update profiles for existing auth users (by email)
insert into profiles (id, email, name, role, status)
select id, email, split_part(email, '@', 1), 'admin', 'active'
from auth.users where email = 'admin@carflow.dev'
on conflict (id) do update set role = 'admin', status = 'active';

insert into profiles (id, email, name, role, status)
select id, email, split_part(email, '@', 1), 'dealer', 'active'
from auth.users where email = 'dealer@carflow.dev'
on conflict (id) do update set role = 'dealer', status = 'active';

insert into profiles (id, email, name, role, status)
select id, email, split_part(email, '@', 1), 'customer', 'active'
from auth.users where email = 'customer@carflow.dev'
on conflict (id) do update set role = 'customer', status = 'active';

-- Create starter plan (skip if exists)
insert into plans (name, tier, status, price_monthly, price_yearly, features)
select 'Starter', 'starter', 'active', 99, 999, array['Up to 10 listings', 'Email support']
where not exists (select 1 from plans where tier = 'starter');

-- Create professional plan (skip if exists)
insert into plans (name, tier, status, price_monthly, price_yearly, features)
select 'Professional', 'professional', 'active', 299, 2990, array['Up to 25 vehicles', 'Advanced analytics', 'Priority support', 'API access']
where not exists (select 1 from plans where tier = 'professional');

-- Create dealer linked to dealer profile (skip if dealer already exists for that user)
insert into dealers (name, owner_user_id, status, plan_id, rating, total_revenue, active_rentals, vehicles_count, contact_email)
select 'Prime Auto Group', p.id, 'active',
  (select id from plans where tier = 'starter' limit 1),
  4.6, 12000, 2, 3, p.email
from profiles p
where p.role = 'dealer'
  and not exists (select 1 from dealers d where d.owner_user_id = p.id)
limit 1;

-- Seed sample vehicles for the dealer (skip if vehicles already exist)
insert into vehicles (dealer_id, name, make, model, year, category, status, price_per_day, mileage, transmission, fuel_type, seats)
select d.id, v.name, v.make, v.model, v.year, v.category::vehicle_category, v.status::vehicle_status, v.price_per_day, v.mileage, v.transmission::transmission_type, v.fuel_type::fuel_type, v.seats
from dealers d
cross join (
  values
    ('BMW X5 xDrive40i', 'BMW', 'X5', 2024, 'suv', 'available', 450, 15000, 'automatic', 'gas', 5),
    ('Mercedes C 300', 'Mercedes', 'C 300', 2023, 'sedan', 'available', 350, 22000, 'automatic', 'gas', 5),
    ('Tesla Model 3', 'Tesla', 'Model 3', 2024, 'ev', 'available', 380, 8000, 'automatic', 'electric', 5),
    ('Toyota Land Cruiser', 'Toyota', 'Land Cruiser', 2023, 'suv', 'available', 550, 12000, 'automatic', 'diesel', 7),
    ('Honda Accord', 'Honda', 'Accord', 2024, 'sedan', 'available', 200, 5000, 'automatic', 'gas', 5)
) as v(name, make, model, year, category, status, price_per_day, mileage, transmission, fuel_type, seats)
where d.name = 'Prime Auto Group'
  and not exists (select 1 from vehicles where dealer_id = d.id);

-- Create subscription for dealer user (owner_id = user id per RLS)
insert into subscriptions (owner_id, owner_type, plan_id, status, start_date, usage)
select p.id, 'dealer'::subscription_owner_type, d.plan_id, 'active', current_date,
  jsonb_build_object('rentals', 2, 'listings', 5, 'messages', 1247)
from profiles p
join dealers d on d.owner_user_id = p.id
where p.role = 'dealer'
  and not exists (select 1 from subscriptions s where s.owner_id = p.id and s.owner_type = 'dealer');

-- Seed sample invoice for dealer
insert into invoices (owner_id, owner_type, amount, status, date, description)
select p.id, 'dealer'::subscription_owner_type, 99, 'paid', current_date - interval '1 month', 'Starter plan - Monthly'
from profiles p
where p.role = 'dealer'
  and not exists (select 1 from invoices i where i.owner_id = p.id and i.owner_type = 'dealer' limit 1)
limit 1;
