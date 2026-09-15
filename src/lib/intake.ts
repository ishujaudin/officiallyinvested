import { supabase } from './supabase';

// ===== Acquisition criteria (hard gates, spec §1) =====
export const CRITERIA = {
  business: { minRevenue: 1_000_000, minNetProfit: 200_000 },
  property: { minPortfolioValue: 1_000_000 },
} as const;

// Community links (used on the below-threshold redirect screen)
export const INSTAGRAM_URL = 'https://instagram.com/officially.invested';
export const INSTAGRAM_HANDLE = '@officially.invested';
export const SKOOL_URL = '#'; // TODO: replace with the real Skool community link before launch

// Videos from Sandeep (YouTube/Vimeo embed URLs). Leave '' to hide the slot.
// While empty and SHOW_VIDEO_PLACEHOLDERS is true, an elegant "coming soon" slot is shown.
export const INTRO_VIDEO_URL = '';
export const OUTRO_VIDEO_ELIGIBLE_URL = '';
export const OUTRO_VIDEO_REDIRECT_URL = '';
export const SHOW_VIDEO_PLACEHOLDERS = true; // set false at launch if videos aren't ready

export const SECTORS = [
  'Construction & trades', 'Manufacturing & engineering', 'Logistics & transport',
  'Healthcare & care services', 'Professional services', 'IT & software',
  'Retail & e-commerce', 'Hospitality & leisure', 'Property & facilities services',
  'Education & training', 'Recruitment & HR', 'Marketing & media',
  'Financial services', 'Other',
];

export const UK_REGIONS = [
  'London', 'South East', 'South West', 'East of England', 'East Midlands',
  'West Midlands', 'Yorkshire & the Humber', 'North West', 'North East',
  'Scotland', 'Wales', 'Northern Ireland', 'Multiple regions',
];

export const EMPLOYEE_RANGES = ['Just me', '2–9', '10–24', '25–49', '50–99', '100–249', '250+'];

export const HEARD_VIA_OPTIONS = [
  'Instagram', 'YouTube', 'Podcast', 'Google search', 'Referral / word of mouth',
  'Broker network', 'LinkedIn', 'Other',
];

export const YEAR_OPTIONS = (() => {
  const years: string[] = [];
  for (let y = new Date().getFullYear(); y >= 1950; y--) years.push(String(y));
  years.push('Before 1950');
  return years;
})();

export type SubmissionType = 'business' | 'property';

export interface IntakeForm {
  // step 1 - about you
  submitter_name: string;
  email: string;
  phone: string;
  submitter_role: 'owner' | 'broker' | 'other' | '';
  role_in_business: string;
  ownership_stake_pct: string;
  firm_name: string;
  owner_name: string;
  owner_contact: string;
  heard_via: string;
  type: SubmissionType | '';

  // business path
  business_name: string;
  companies_house_number: string;
  website: string;
  sector: string;
  year_established: string;
  region: string;
  employees: string;
  description: string;
  revenue: string;
  net_profit: string;
  revenue_trend: string;
  recurring_pct: string;
  customer_concentration: string; // 'yes' | 'no' | ''
  handover_willing: string; // 'yes' | 'no' | ''
  handover_period: string;

  // property path
  is_spv: string; // 'yes' | 'no' | ''
  spv_name: string;
  selling_100pct: string; // 'yes' | 'no' | ''
  portfolio_value: string;
  property_type: string;
  num_units: string;
  locations: string;
  gross_rent: string;
  net_income: string;
  gross_yield: string;
  void_rate: string;
  outstanding_debt: string;
  ltv: string;
  postal_address: string;   // optional - where the welcome letter should be posted
  postal_postcode: string;

  // deal expectations (shared)
  asking_price: string;
  day_one_cash_need: string;
  open_to_deferred: 'yes' | 'no' | 'maybe' | '';
  reason_for_sale: string;

  // final
  links: string;
  notes: string;
  consent: boolean;
  marketing_optin: boolean;
  network_optin: boolean;
}

export const EMPTY_FORM: IntakeForm = {
  submitter_name: '', email: '', phone: '', submitter_role: '',
  role_in_business: '', ownership_stake_pct: '100', firm_name: '',
  owner_name: '', owner_contact: '', heard_via: '', type: '',
  business_name: '', companies_house_number: '', website: '', sector: '',
  year_established: '', region: '', employees: '', description: '',
  revenue: '', net_profit: '', revenue_trend: '', recurring_pct: '',
  customer_concentration: '', handover_willing: '', handover_period: '',
  is_spv: '', spv_name: '', selling_100pct: '', portfolio_value: '',
  property_type: '', num_units: '', locations: '', gross_rent: '',
  net_income: '', gross_yield: '', void_rate: '', outstanding_debt: '', ltv: '',
  postal_address: '', postal_postcode: '',
  asking_price: '', day_one_cash_need: '', open_to_deferred: '',
  reason_for_sale: '', links: '', notes: '', consent: false, marketing_optin: false,
  network_optin: false,
};

/** Parse a user-typed money/number field: strips £, commas, spaces. */
export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[£,\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Client-side mirror of the server eligibility gate (server result is authoritative). */
export function checkEligibility(form: IntakeForm): boolean {
  if (form.type === 'business') {
    const rev = parseAmount(form.revenue) ?? 0;
    const profit = parseAmount(form.net_profit) ?? 0;
    return rev >= CRITERIA.business.minRevenue && profit >= CRITERIA.business.minNetProfit;
  }
  if (form.type === 'property') {
    const value = parseAmount(form.portfolio_value) ?? 0;
    return value >= CRITERIA.property.minPortfolioValue && form.is_spv === 'yes';
  }
  return false;
}

export interface SubmitResult {
  reference: string;
  eligible: boolean;
  uploadWarnings: string[];
}

function boolStr(v: string): string {
  return v === 'yes' ? 'true' : v === 'no' ? 'false' : '';
}

/** Submit the form + upload files. Throws on hard failure. */
export async function submitOpportunity(form: IntakeForm, files: File[]): Promise<SubmitResult> {
  if (!supabase) {
    throw new Error('Submissions are temporarily unavailable. Please email us instead.');
  }

  const payload: Record<string, string | boolean> = {
    type: form.type,
    submitter_name: form.submitter_name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    submitter_role: form.submitter_role,
    role_in_business: form.role_in_business.trim(),
    ownership_stake_pct: form.ownership_stake_pct,
    firm_name: form.firm_name.trim(),
    owner_name: form.owner_name.trim(),
    owner_contact: form.owner_contact.trim(),
    heard_via: form.heard_via.trim(),
    business_name: form.business_name.trim(),
    companies_house_number: form.companies_house_number.trim(),
    website: form.website.trim(),
    sector: form.sector.trim(),
    year_established: form.year_established === 'Before 1950' ? '1949' : form.year_established,
    region: form.region.trim(),
    employees: form.employees,
    description: form.description.trim(),
    revenue: String(parseAmount(form.revenue) ?? ''),
    net_profit: String(parseAmount(form.net_profit) ?? ''),
    revenue_trend: form.revenue_trend,
    recurring_pct: form.recurring_pct,
    customer_concentration: boolStr(form.customer_concentration),
    handover_willing: boolStr(form.handover_willing),
    handover_period: form.handover_period.trim(),
    is_spv: boolStr(form.is_spv),
    spv_name: form.spv_name.trim(),
    selling_100pct: boolStr(form.selling_100pct),
    portfolio_value: String(parseAmount(form.portfolio_value) ?? ''),
    property_type: form.property_type,
    num_units: form.num_units,
    locations: form.locations.trim(),
    postal_address: form.postal_address.trim(),
    postal_postcode: form.postal_postcode.trim().toUpperCase(),
    gross_rent: String(parseAmount(form.gross_rent) ?? ''),
    net_income: String(parseAmount(form.net_income) ?? ''),
    gross_yield: form.gross_yield,
    void_rate: form.void_rate === '' ? '' : String(100 - Number(form.void_rate)),
    outstanding_debt: String(parseAmount(form.outstanding_debt) ?? ''),
    ltv: form.ltv,
    asking_price: String(parseAmount(form.asking_price) ?? ''),
    day_one_cash_need: String(parseAmount(form.day_one_cash_need) ?? ''),
    open_to_deferred: form.open_to_deferred,
    reason_for_sale: form.reason_for_sale.trim(),
    links: form.links.trim(),
    notes: form.notes.trim(),
    consent: form.consent,
    marketing_optin: form.marketing_optin,
    network_optin: form.network_optin,
  };

  const { data, error } = await supabase.rpc('submit_opportunity', { payload });
  if (error) throw new Error(error.message);

  const { id, reference, eligible } = data as { id: string; reference: string; eligible: boolean };

  const uploadWarnings: string[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${id}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from('submission-documents')
      .upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (upErr) {
      uploadWarnings.push(`${file.name}: ${upErr.message}`);
      continue;
    }
    const { error: docErr } = await supabase.rpc('add_document', {
      p_submission_id: id,
      p_file_path: path,
      p_file_name: file.name,
      p_file_type: file.type,
    });
    if (docErr) uploadWarnings.push(`${file.name}: saved but not registered (${docErr.message})`);
  }

  return { reference, eligible, uploadWarnings };
}
