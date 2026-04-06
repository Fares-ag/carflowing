-- When a booking request is approved, create a rental and notify the customer.
-- Run in Supabase SQL editor.

create or replace function public.handle_booking_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dealer_id uuid;
  v_start_date date;
  v_end_date date;
  v_total numeric;
  v_months int;
  v_note_json jsonb;
  v_rental_id uuid;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  -- Get dealer_id from vehicle
  select v.dealer_id into v_dealer_id
  from public.vehicles v
  where v.id = new.vehicle_id;

  if v_dealer_id is null then
    return new;
  end if;

  -- Parse note JSON
  v_note_json := null;
  if new.note is not null and new.note <> '' then
    begin
      v_note_json := new.note::jsonb;
    exception when others then
      v_note_json := null;
    end;
  end if;

  -- Extract start_date, total, durationMonths
  v_start_date := coalesce(
    (v_note_json->>'startDate')::date,
    current_date
  );
  v_total := coalesce(
    (v_note_json->>'total')::numeric,
    0
  );
  v_months := coalesce(
    (v_note_json->>'durationMonths')::int,
    1
  );

  if v_months < 1 then
    v_months := 1;
  end if;

  v_end_date := v_start_date + (v_months || ' months')::interval;

  -- Create rental
  insert into public.rentals (
    customer_id,
    dealer_id,
    vehicle_id,
    start_date,
    end_date,
    status,
    total_amount,
    payment_status
  ) values (
    new.customer_id,
    v_dealer_id,
    new.vehicle_id,
    v_start_date,
    v_end_date::date,
    'reserved',
    v_total,
    'completed'
  )
  returning id into v_rental_id;

  -- Create payment for revenue tracking
  if v_rental_id is not null and v_total > 0 then
    insert into public.payments (
      rental_id,
      customer_id,
      dealer_id,
      amount,
      status,
      type,
      method
    ) values (
      v_rental_id,
      new.customer_id,
      v_dealer_id,
      v_total,
      'completed',
      'rental',
      'card'
    );
  end if;

  -- Notify customer
  insert into public.notifications (user_id, type, title, message, read)
  values (
    new.customer_id,
    'success',
    'Booking Approved',
    'Your booking request has been approved. You can view it in My Rentals.',
    false
  );

  return new;
end;
$$;

drop trigger if exists on_booking_request_approved on public.booking_requests;
create trigger on_booking_request_approved
  after update of status on public.booking_requests
  for each row
  execute function public.handle_booking_approved();
