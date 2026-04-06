-- Backfill: Create rentals for booking requests that were already approved
-- before the trigger was added. Run this once after applying the trigger.

do $$
declare
  r record;
  v_dealer_id uuid;
  v_start_date date;
  v_end_date date;
  v_total numeric;
  v_months int;
  v_note_json jsonb;
  v_rental_id uuid;
begin
  for r in
    select br.id, br.customer_id, br.vehicle_id, br.note, br.created_at as br_created_at
    from public.booking_requests br
    where br.status = 'approved'
      and not exists (
        select 1 from public.rentals rr
        where rr.vehicle_id = br.vehicle_id and rr.customer_id = br.customer_id
      )
  loop
    -- Get dealer_id from vehicle
    select v.dealer_id into v_dealer_id
    from public.vehicles v
    where v.id = r.vehicle_id;

    if v_dealer_id is null then
      continue;
    end if;

    -- Parse note JSON
    v_note_json := null;
    if r.note is not null and r.note <> '' then
      begin
        v_note_json := r.note::jsonb;
      exception when others then
        v_note_json := null;
      end;
    end if;

    v_start_date := coalesce(
      (v_note_json->>'startDate')::date,
      r.br_created_at::date
    );
    v_total := coalesce((v_note_json->>'total')::numeric, 0);
    v_months := coalesce((v_note_json->>'durationMonths')::int, 1);
    if v_months < 1 then
      v_months := 1;
    end if;
    v_end_date := v_start_date + (v_months || ' months')::interval;

    -- Create rental
    insert into public.rentals (
      customer_id, dealer_id, vehicle_id,
      start_date, end_date, status, total_amount, payment_status
    ) values (
      r.customer_id, v_dealer_id, r.vehicle_id,
      v_start_date, v_end_date::date, 'reserved', v_total, 'completed'
    )
    returning id into v_rental_id;

    -- Create payment for revenue tracking
    if v_rental_id is not null and v_total > 0 then
      insert into public.payments (
        rental_id, customer_id, dealer_id, amount, status, type, method
      ) values (
        v_rental_id, r.customer_id, v_dealer_id, v_total, 'completed', 'rental', 'card'
      );
    end if;
  end loop;
end $$;
