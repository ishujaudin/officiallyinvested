-- =============================================================================
-- Security hardening: dashboard admin access = host-org MEMBERSHIP, not email domain
-- -----------------------------------------------------------------------------
-- Live state before this migration (audited 2026-09-15):
--   * Every dashboard table (submissions, documents, scores, deal_items,
--     deal_outputs, communications) and the submission-documents bucket is
--     gated by public.is_oi_admin().
--   * is_oi_admin() was:  (auth.jwt() ->> 'email') ilike '%@officiallyinvested.com'
--     i.e. a domain match on the JWT email. Anyone able to obtain a session
--     with such an address (e.g. password sign-up while email confirmation is
--     off, or an email change without verification) becomes a full admin, and
--     nobody can be revoked short of deleting their account.
--
-- After: is_oi_admin() is true only for owner/admin/analyst members of the
-- host org in acq.org_members - the same rule the acq-* edge functions enforce.
-- Keeping the function NAME means all existing policies upgrade in place.
--
-- Safe to apply: the host org's only member is Sandeep (owner). Sellers keep
-- submitting anonymously through the security-definer RPCs, which are unchanged.
-- =============================================================================

-- ---- 1. Redefine the admin predicate ----------------------------------------
-- security definer: the API roles can't read acq.org_members directly (RLS +
-- schema not exposed), so the lookup runs with the function owner's rights.
-- search_path is pinned so the definer can't be hijacked via a rogue schema.
create or replace function public.is_oi_admin()
returns boolean
language sql
stable
security definer
set search_path = public, acq
as $$
  select exists (
    select 1
    from acq.org_members m
    where m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'analyst')
      and m.org_id = (select id from acq.organizations order by created_at limit 1)
  );
$$;
revoke all on function public.is_oi_admin() from public;
grant execute on function public.is_oi_admin() to authenticated;

-- ---- 2. Make sure RLS is on for every table those policies protect ----------
-- (idempotent; policies without RLS enabled would silently not apply)
alter table public.submissions    enable row level security;
alter table public.documents      enable row level security;
alter table public.scores         enable row level security;
alter table public.deal_items     enable row level security;
alter table public.deal_outputs   enable row level security;
alter table public.communications enable row level security;

-- ---- 3. Secrets table: no API privileges at all ------------------------------
-- oi_config (Anthropic / Resend / Stannp keys, internal secret) is read only by
-- edge functions over the direct DB connection. It already has RLS on with no
-- policies; revoking the default grants means it stays sealed even if RLS were
-- ever toggled off by mistake.
alter table public.oi_config enable row level security;
revoke all on table public.oi_config from anon, authenticated;

-- =============================================================================
-- ROLLBACK (run manually if the dashboard admin loses access after applying):
--
--   create or replace function public.is_oi_admin()
--   returns boolean language sql stable as $$
--     select coalesce((auth.jwt() ->> 'email') ilike '%@officiallyinvested.com', false);
--   $$;
--   grant execute on function public.is_oi_admin() to authenticated;
--
-- (the RLS enables and the oi_config revoke are safe to leave in place)
-- =============================================================================
