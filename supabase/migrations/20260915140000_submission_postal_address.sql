-- =============================================================================
-- Seller welcome letters: optional postal address on the intake form.
-- -----------------------------------------------------------------------------
-- Business sellers give a Companies House number, so acq-seller-letter can
-- fetch the registered office itself. Property sellers give an SPV number, but
-- an SPV's registered office is often an accountant's, so the form now asks for
-- an optional correspondence address. acq-seller-letter uses these two columns
-- first, then Companies House, then raises a task if neither is available.
--
-- Additive and nullable. The submit_opportunity RPC is recreated from its LIVE
-- definition (captured 2026-09-15) with exactly two columns added; grants and
-- ownership are preserved by CREATE OR REPLACE.
-- =============================================================================

-- ---- 1. columns ----------------------------------------------------------------
alter table public.submissions
  add column if not exists postal_address  text,
  add column if not exists postal_postcode text;

comment on column public.submissions.postal_address  is 'Optional correspondence address typed by the seller (street, town) - used for the welcome letter';
comment on column public.submissions.postal_postcode is 'Optional correspondence postcode typed by the seller - used for the welcome letter';

-- ---- 2. intake RPC: persist the two new payload keys ----------------------------
CREATE OR REPLACE FUNCTION public.submit_opportunity(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_ref text;
  v_type public.submission_type;
  v_eligible boolean;
begin
  if coalesce((payload->>'consent')::boolean, false) is distinct from true then
    raise exception 'Consent is required';
  end if;
  if coalesce(payload->>'submitter_name', '') = '' or coalesce(payload->>'email', '') = '' or coalesce(payload->>'phone', '') = '' then
    raise exception 'Name, email and phone are required';
  end if;

  v_type := (payload->>'type')::public.submission_type;

  insert into public.submissions (
    type, submitter_name, email, phone, submitter_role, role_in_business,
    ownership_stake_pct, firm_name, owner_name, owner_contact, heard_via,
    business_name, companies_house_number, website, sector, year_established,
    region, employees, description, revenue, net_profit, revenue_trend,
    recurring_pct, customer_concentration, handover_willing, handover_period,
    is_spv, spv_name, selling_100pct, portfolio_value, property_type, num_units,
    locations, gross_rent, net_income, gross_yield, void_rate, outstanding_debt, ltv,
    asking_price, day_one_cash_need, open_to_deferred, reason_for_sale,
    links, notes, marketing_optin, network_optin, consent,
    postal_address, postal_postcode
  ) values (
    v_type,
    payload->>'submitter_name', payload->>'email', payload->>'phone',
    (payload->>'submitter_role')::public.submitter_role,
    payload->>'role_in_business',
    nullif(payload->>'ownership_stake_pct', '')::numeric,
    payload->>'firm_name', payload->>'owner_name', payload->>'owner_contact', payload->>'heard_via',
    payload->>'business_name', payload->>'companies_house_number', payload->>'website',
    payload->>'sector', nullif(payload->>'year_established', '')::int,
    payload->>'region', nullif(payload->>'employees', ''), payload->>'description',
    nullif(payload->>'revenue', '')::numeric, nullif(payload->>'net_profit', '')::numeric,
    payload->>'revenue_trend', nullif(payload->>'recurring_pct', '')::numeric,
    nullif(payload->>'customer_concentration', '')::boolean,
    nullif(payload->>'handover_willing', '')::boolean, payload->>'handover_period',
    nullif(payload->>'is_spv', '')::boolean, payload->>'spv_name',
    nullif(payload->>'selling_100pct', '')::boolean,
    nullif(payload->>'portfolio_value', '')::numeric, payload->>'property_type',
    nullif(payload->>'num_units', '')::int, payload->>'locations',
    nullif(payload->>'gross_rent', '')::numeric, nullif(payload->>'net_income', '')::numeric,
    nullif(payload->>'gross_yield', '')::numeric, nullif(payload->>'void_rate', '')::numeric,
    nullif(payload->>'outstanding_debt', '')::numeric, nullif(payload->>'ltv', '')::numeric,
    nullif(payload->>'asking_price', '')::numeric, nullif(payload->>'day_one_cash_need', '')::numeric,
    nullif(payload->>'open_to_deferred', '')::public.yes_no_maybe,
    payload->>'reason_for_sale', payload->>'links', payload->>'notes',
    coalesce((payload->>'marketing_optin')::boolean, false),
    coalesce((payload->>'network_optin')::boolean, false),
    true,
    nullif(payload->>'postal_address', ''), nullif(payload->>'postal_postcode', '')
  )
  returning id, reference into v_id, v_ref;

  if v_type = 'business' then
    v_eligible := coalesce(nullif(payload->>'revenue', '')::numeric, 0) >= 1000000
              and coalesce(nullif(payload->>'net_profit', '')::numeric, 0) >= 200000;
  else
    v_eligible := coalesce(nullif(payload->>'portfolio_value', '')::numeric, 0) >= 1000000
              and coalesce(nullif(payload->>'is_spv', '')::boolean, false);
  end if;

  if not v_eligible then
    update public.submissions set status = 'ineligible' where id = v_id;
  end if;

  return jsonb_build_object('id', v_id, 'reference', v_ref, 'eligible', v_eligible);
end;
$function$;
