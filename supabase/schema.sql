-- Supabase schema for CarFlow
-- Run in Supabase SQL editor or via migrations.

create extension if not exists "uuid-ossp";

-- Enums
do $$ begin
  create type user_role as enum ('admin', 'dealer', 'customer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_status as enum ('active', 'suspended', 'pending');
exception when duplicate_object then null; end $$;

do $$ begin
  create type customer_status as enum ('active', 'suspended', 'verified', 'unverified');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vehicle_status as enum ('available', 'rented', 'maintenance', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vehicle_category as enum ('sedan', 'suv', 'truck', 'luxury', 'ev', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transmission_type as enum ('automatic', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fuel_type as enum ('gas', 'diesel', 'electric', 'hybrid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rental_status as enum ('reserved', 'active', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'completed', 'refunded', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_type as enum ('rental', 'subscription', 'refund');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method_type as enum ('card', 'bank', 'wallet');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_tier as enum ('starter', 'professional', 'enterprise');
exception when duplicate_object then null; end $$;

do $$ begin
  create type complaint_priority as enum ('low', 'medium', 'high', 'urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type complaint_status as enum ('open', 'in_progress', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_folder as enum ('inbox', 'sent', 'starred', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_type as enum ('info', 'warning', 'success', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_stage as enum ('new', 'contacted', 'qualified', 'converted', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum ('trial', 'active', 'past_due', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_owner_type as enum ('dealer', 'customer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('paid', 'due', 'overdue', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_request_status as enum ('pending', 'approved', 'declined');
exception when duplicate_object then null; end $$;

-- Profiles (extends auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role user_role not null default 'customer',
  phone text,
  avatar_url text,
  status user_status not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists customer_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  status customer_status not null default 'unverified',
  join_date timestamptz not null default now(),
  rentals_count integer not null default 0,
  total_spent numeric not null default 0
);

create table if not exists plans (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  tier plan_tier not null,
  status plan_status not null default 'draft',
  price_monthly numeric not null default 0,
  price_yearly numeric not null default 0,
  features text[] not null default '{}'
);

create table if not exists dealers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_user_id uuid not null references profiles(id) on delete cascade,
  status user_status not null default 'pending',
  plan_id uuid references plans(id),
  rating numeric not null default 0,
  total_revenue numeric not null default 0,
  active_rentals integer not null default 0,
  vehicles_count integer not null default 0,
  contact_email text not null,
  contact_phone text,
  website text,
  address text,
  description text,
  license_number text,
  tax_id text,
  business_hours jsonb not null default '[]',
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists vehicles (
  id uuid primary key default uuid_generate_v4(),
  dealer_id uuid not null references dealers(id) on delete cascade,
  name text not null,
  make text not null,
  model text not null,
  year integer not null,
  category vehicle_category not null,
  status vehicle_status not null default 'available',
  price_per_day numeric not null default 0,
  mileage integer not null default 0,
  transmission transmission_type not null,
  fuel_type fuel_type not null,
  seats integer not null default 4,
  image_url text
);

create table if not exists rentals (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references profiles(id) on delete cascade,
  dealer_id uuid not null references dealers(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status rental_status not null default 'reserved',
  total_amount numeric not null default 0,
  payment_status payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  rental_id uuid references rentals(id) on delete set null,
  customer_id uuid references profiles(id) on delete set null,
  dealer_id uuid references dealers(id) on delete set null,
  amount numeric not null default 0,
  status payment_status not null default 'pending',
  type payment_type not null,
  method payment_method_type not null default 'card',
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null,
  owner_type subscription_owner_type not null,
  plan_id uuid references plans(id),
  status subscription_status not null default 'trial',
  start_date date not null default current_date,
  end_date date,
  usage jsonb not null default '{"rentals":0,"listings":0,"messages":0}'
);

create table if not exists invoices (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null,
  owner_type subscription_owner_type not null,
  amount numeric not null default 0,
  status invoice_status not null default 'due',
  date date not null default current_date,
  description text not null
);

create table if not exists booking_requests (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references profiles(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  status booking_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  note text,
  decline_reason text
);

create table if not exists favorites (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references profiles(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists complaints (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references profiles(id) on delete cascade,
  category text not null,
  priority complaint_priority not null default 'low',
  status complaint_status not null default 'open',
  subject text not null,
  description text not null,
  created_at timestamptz not null default now(),
  assigned_to uuid references profiles(id)
);

create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id uuid not null references profiles(id) on delete cascade,
  subject text not null,
  body text not null,
  read boolean not null default false,
  folder message_folder not null default 'inbox',
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null default 'info',
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  dealer_id uuid not null references dealers(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  source text not null,
  stage lead_stage not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists payment_methods (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  brand text not null,
  last4 text not null,
  expiry_month integer not null,
  expiry_year integer not null,
  is_default boolean not null default false,
  method_type payment_method_type not null default 'card'
);

create table if not exists app_settings (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null default 'CarFlow',
  support_email text not null default 'support@carflow.dev',
  support_phone text,
  default_tax_rate numeric not null default 0.05,
  updated_at timestamptz not null default now()
);

-- Storage buckets (run once)
insert into storage.buckets (id, name, public)
values
  ('vehicle-images', 'vehicle-images', true),
  ('user-avatars', 'user-avatars', true),
  ('documents', 'documents', false)
on conflict do nothing;
