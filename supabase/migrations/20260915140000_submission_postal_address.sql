-- =============================================================================
-- Seller welcome letters: optional postal address on the intake form.
-- -----------------------------------------------------------------------------
-- Business sellers give a Companies House number, so acq-seller-letter can
-- fetch the registered office itself. Property sellers have no such lookup, so
-- the form now asks for a postal address (optional). acq-seller-letter uses
-- these two columns first, then falls back to Companies House, then raises a
-- task if neither is available.
-- Additive and nullable - no existing row or code path changes.
-- =============================================================================
alter table public.submissions
  add column if not exists postal_address  text,
  add column if not exists postal_postcode text;

comment on column public.submissions.postal_address  is 'Optional postal address typed by the seller (street, town) - used for the welcome letter';
comment on column public.submissions.postal_postcode is 'Optional postcode typed by the seller - used for the welcome letter';
