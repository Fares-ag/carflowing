-- Backfill subscriptions and sample invoice for dealer users who don't have one
-- Run this if dealers exist but have no subscription (e.g. created before seed included subscription)

insert into subscriptions (owner_id, owner_type, plan_id, status, start_date, usage)
select d.owner_user_id, 'dealer'::subscription_owner_type, d.plan_id, 'active', current_date,
  jsonb_build_object(
    'rentals', coalesce((select count(*) from rentals r where r.dealer_id = d.id), 0),
    'listings', coalesce(d.vehicles_count, 0),
    'messages', 0
  )
from dealers d
where not exists (
  select 1 from subscriptions s
  where s.owner_id = d.owner_user_id and s.owner_type = 'dealer'
);

-- Optional: add one sample invoice per dealer without any invoices
insert into invoices (owner_id, owner_type, amount, status, date, description)
select d.owner_user_id, 'dealer'::subscription_owner_type,
  coalesce(pl.price_monthly, 99), 'paid', current_date - interval '1 month',
  coalesce(pl.name, 'Starter') || ' plan - Monthly'
from dealers d
left join plans pl on pl.id = d.plan_id
where not exists (
  select 1 from invoices i
  where i.owner_id = d.owner_user_id and i.owner_type = 'dealer'
);
