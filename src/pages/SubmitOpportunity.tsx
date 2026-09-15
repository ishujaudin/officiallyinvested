import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Building2, Home as HomeIcon, CheckCircle2,
  ShieldCheck, Upload, X, Instagram, Users, AlertTriangle, Loader2, Play,
} from 'lucide-react';
import {
  IntakeForm, EMPTY_FORM, checkEligibility, submitOpportunity,
  INSTAGRAM_URL, INSTAGRAM_HANDLE, SKOOL_URL,
  INTRO_VIDEO_URL, OUTRO_VIDEO_ELIGIBLE_URL, OUTRO_VIDEO_REDIRECT_URL, SHOW_VIDEO_PLACEHOLDERS,
  SECTORS, UK_REGIONS, EMPLOYEE_RANGES, HEARD_VIA_OPTIONS, YEAR_OPTIONS,
} from '../lib/intake';
import { trackLead, trackFormStart } from '../lib/tracking';

// ===================== form primitives =====================

interface FieldProps {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, required, help, error, children }: FieldProps) {
  return (
    <div>
      <label className="block text-white font-medium mb-2">
        {label} {required && <span className="text-[#FFD700]">*</span>}
      </label>
      {help && <p className="text-white/50 text-sm mb-2">{help}</p>}
      {children}
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}

const inputClass =
  'w-full px-5 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#FFD700] focus:border-transparent';

interface TextProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}

function TextInput({ value, onChange, placeholder, type = 'text' }: TextProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />
  );
}

function PhoneInput({ value, onChange }: TextProps) {
  return (
    <input
      type="tel"
      inputMode="tel"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9+()\s-]/g, ''))}
      placeholder="+44 7700 900123"
      className={inputClass}
    />
  );
}

/** Money input: digits only, auto-formats with thousands separators. */
function MoneyInput({ value, onChange, placeholder }: TextProps) {
  const format = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 12);
    return digits ? Number(digits).toLocaleString('en-GB') : '';
  };
  return (
    <div className="relative">
      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/50">£</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(format(e.target.value))}
        placeholder={placeholder}
        className={inputClass + ' pl-9'}
      />
    </div>
  );
}

/** Whole-number input (e.g. number of units). */
function NumberInput({ value, onChange, placeholder }: TextProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
      placeholder={placeholder}
      className={inputClass}
    />
  );
}

interface SliderProps {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  optional?: boolean;
}

/** Percentage/number slider — impossible to enter bad data. */
function Slider({ value, onChange, min = 0, max = 100, step = 1, suffix = '%', optional }: SliderProps) {
  const isSet = value !== '';
  const num = isSet ? Number(value) : min;
  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={num}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 accent-[#FFD700] cursor-pointer"
      />
      <span className={'min-w-[84px] text-center px-3 py-1.5 rounded-full text-sm font-semibold ' + (isSet ? 'bg-[#FFD700] text-[#0A2540]' : 'bg-white/10 text-white/50')}>
        {isSet ? `${value}${suffix}` : 'Not set'}
      </span>
      {optional && isSet && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear" className="text-white/40 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

interface PillsProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

function RadioPills({ value, onChange, options }: PillsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={
            'px-5 py-2.5 rounded-full font-medium transition-all border ' +
            (value === opt.value
              ? 'bg-[#FFD700] text-[#0A2540] border-[#FFD700]'
              : 'bg-white/5 text-white border-white/15 hover:bg-white/10')
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SelectInput({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass + ' appearance-none cursor-pointer ' + (value ? '' : 'text-white/40')}
    >
      <option value="" className="bg-[#0A2540] text-white/60">{placeholder || 'Select…'}</option>
      {options.map((o) => (
        <option key={o} value={o} className="bg-[#0A2540] text-white">{o}</option>
      ))}
    </select>
  );
}

/** Video slot: embeds the URL if set; shows an elegant placeholder otherwise. */
function VideoSlot({ url, caption }: { url: string; caption: string }) {
  if (url) {
    return (
      <div className="mb-8">
        <div className="relative pt-[56.25%] rounded-2xl overflow-hidden bg-white/5">
          <iframe
            src={url}
            title={caption}
            className="absolute top-0 left-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>
      </div>
    );
  }
  if (!SHOW_VIDEO_PLACEHOLDERS) return null;
  return (
    <div className="mb-8 rounded-2xl border border-dashed border-white/20 bg-white/5 p-8 flex items-center justify-center gap-4">
      <span className="flex items-center justify-center w-12 h-12 rounded-full bg-[#FFD700]">
        <Play className="h-5 w-5 text-[#0A2540] ml-0.5" />
      </span>
      <div>
        <div className="text-white font-semibold">{caption}</div>
        <div className="text-white/50 text-sm">Video coming soon</div>
      </div>
    </div>
  );
}

function SocialButtons() {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center">
      <a
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center bg-[#FFD700] text-[#0A2540] px-8 py-4 rounded-full font-semibold hover:bg-opacity-90 transition-all"
      >
        <Instagram className="mr-2 h-5 w-5" />
        Follow {INSTAGRAM_HANDLE}
      </a>
      <a
        href={SKOOL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center bg-white/10 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/20 transition-all"
      >
        <Users className="mr-2 h-5 w-5" />
        Join my Skool community
      </a>
    </div>
  );
}

// ===================== the page =====================

type Phase = 'form' | 'submitting' | 'done-eligible' | 'done-redirect' | 'error';

const STEP_LABELS = ['About you', 'The basics', 'The numbers', 'Documents & submit'];

export default function SubmitOpportunity() {
  const [form, setFormState] = useState<IntakeForm>(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('form');
  const [reference, setReference] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const set = (key: keyof IntakeForm) => (v: string | boolean) =>
    setFormState((f) => ({ ...f, [key]: v }));

  const isBusiness = form.type === 'business';
  const isProperty = form.type === 'property';
  const notOwner = form.submitter_role === 'broker' || form.submitter_role === 'other';

  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    const req = (key: keyof IntakeForm, msg = 'Required') => {
      if (!String(form[key]).trim()) e[key] = msg;
    };
    if (s === 0) {
      req('submitter_name');
      req('email');
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Please enter a valid email';
      req('phone');
      if (form.phone && form.phone.replace(/[^0-9]/g, '').length < 10) e.phone = 'Please enter a valid phone number';
      req('submitter_role', 'Please choose one');
      req('role_in_business');
      if (notOwner) {
        req('owner_name', "Owner's name is required");
        req('owner_contact', "Owner's contact details are required");
      }
      if (!form.type) e.type = 'Please choose what you are submitting';
    }
    if (s === 1 && isBusiness) {
      req('business_name');
      req('companies_house_number');
      if (form.companies_house_number && !/^[A-Za-z0-9]{6,8}$/.test(form.companies_house_number.trim()))
        e.companies_house_number = 'Should be 8 characters, e.g. 01234567 — find it at find-and-update.company-information.service.gov.uk';
      req('sector', 'Please select a sector');
      req('region', 'Please select a region');
      req('description');
    }
    if (s === 1 && isProperty) {
      if (!form.is_spv) e.is_spv = 'Please choose one';
      req('spv_name');
      req('companies_house_number');
      if (form.companies_house_number && !/^[A-Za-z0-9]{6,8}$/.test(form.companies_house_number.trim()))
        e.companies_house_number = 'Should be 8 characters, e.g. 01234567';
      if (!form.selling_100pct) e.selling_100pct = 'Please choose one';
    }
    if (s === 2 && isBusiness) {
      req('revenue');
      req('net_profit');
      req('reason_for_sale');
      req('asking_price');
      req('day_one_cash_need');
    }
    if (s === 2 && isProperty) {
      req('portfolio_value');
      req('property_type', 'Please choose one');
      req('num_units');
      req('locations', 'Please select at least one region');
      req('reason_for_sale');
      req('asking_price');
      req('day_one_cash_need');
    }
    if (s === 3 && !form.consent) {
      e.consent = 'We need your consent to review the submission';
    }
    return e;
  };

  const goNext = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length === 0) {
      if (step === 0) trackFormStart(form.type);
      setStep(step + 1);
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const goBack = () => {
    setErrors({});
    setStep(Math.max(0, step - 1));
    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => f.size <= 10 * 1024 * 1024);
    const tooBig = Array.from(list).filter((f) => f.size > 10 * 1024 * 1024);
    if (tooBig.length) {
      setErrors((e) => ({ ...e, files: `Files over 10MB were skipped: ${tooBig.map((f) => f.name).join(', ')}` }));
    } else {
      setErrors((e) => { const { files: _files, ...rest } = e; return rest; });
    }
    setFiles((f) => [...f, ...incoming].slice(0, 10));
  };

  const handleSubmit = async () => {
    const e = validateStep(3);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setPhase('submitting');
    try {
      const result = await submitOpportunity(form, files);
      setReference(result.reference);
      setUploadWarnings(result.uploadWarnings);
      trackLead({ type: form.type || 'business', eligible: result.eligible, value: form.type === 'property' ? form.portfolio_value : form.revenue });
      setPhase(result.eligible ? 'done-eligible' : 'done-redirect');
      topRef.current?.scrollIntoView();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setPhase('error');
    }
  };

  const eligiblePreview = useMemo(() => checkEligibility(form), [form]);

  // toggle a region in the property locations multi-select
  const toggleLocation = (region: string) => {
    const current = form.locations ? form.locations.split(', ') : [];
    const next = current.includes(region)
      ? current.filter((r) => r !== region)
      : [...current, region];
    set('locations')(next.join(', '));
  };

  // ===================== result screens =====================

  if (phase === 'done-eligible') {
    return (
      <ResultShell>
        <CheckCircle2 className="h-16 w-16 text-[#FFD700] mx-auto mb-6" />
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-4">Thank you — we've got it.</h1>
        <p className="text-white/80 text-xl mb-8">
          Your reference is <span className="text-[#FFD700] font-bold">{reference}</span>
        </p>
        <VideoSlot url={OUTRO_VIDEO_ELIGIBLE_URL} caption="A personal message from Sandeep" />
        <div className="bg-white/5 rounded-2xl p-8 text-left max-w-xl mx-auto mb-8">
          <h2 className="text-white font-bold text-lg mb-4">What happens next</h2>
          <ol className="space-y-3 text-white/80 list-decimal list-inside">
            <li>Our team reviews every submission against our criteria.</li>
            <li>We assess the opportunity and the information you've shared.</li>
            <li>If it's a fit, we'll be in touch directly — typically within 5 working days.</li>
          </ol>
          <p className="text-white/60 mt-6 text-sm">
            The more complete your information, the higher your priority. You'll receive a confirmation
            email shortly — you can reply to it with additional documents at any time.
          </p>
        </div>
        {uploadWarnings.length > 0 && (
          <p className="text-amber-300/90 text-sm mb-6">
            Note: some files didn't upload ({uploadWarnings.length}). You can send them by replying to your confirmation email.
          </p>
        )}
        <p className="text-white/70 mb-8">While you wait — come and join the conversation:</p>
        <div className="mb-10"><SocialButtons /></div>
        <p className="text-white/70 mb-10">Everything you share is treated in strict confidence.<br />— Sandeep, Officially Invested</p>
        <Link to="/" className="inline-flex items-center bg-white/10 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/20 transition-all">
          Back to the homepage
        </Link>
      </ResultShell>
    );
  }

  if (phase === 'done-redirect') {
    return (
      <ResultShell>
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-6">
          Thank you — and here's a thought…
        </h1>
        <VideoSlot url={OUTRO_VIDEO_REDIRECT_URL} caption="A personal message from Sandeep" />
        <p className="text-white/80 text-xl max-w-2xl mx-auto mb-4">
          Based on what you've shared, this currently sits below the criteria we acquire against
          (£1M+ revenue and £200k+ profit, or a £1M+ portfolio held in an SPV).
          <span className="text-[#FFD700] font-semibold"> But you might be in a stronger position than you think.</span>
        </p>
        <p className="text-white/80 text-lg max-w-2xl mx-auto mb-10">
          One of the most powerful moves at your stage isn't selling — it's <strong className="text-white">buying</strong>.
          Acquiring a competitor or a synergistic business can grow you faster than anything organic,
          and it can often be done for £0 down when you know how to structure it. That's exactly what I teach.
        </p>
        <div className="mb-10"><SocialButtons /></div>
        <p className="text-white/60 text-sm mb-2">Your reference is {reference} — we've kept your details, and when you've scaled, we'll be right here.</p>
        <p className="text-white/70">— Sandeep, Officially Invested</p>
      </ResultShell>
    );
  }

  // ===================== form =====================

  const selectedLocations = form.locations ? form.locations.split(', ') : [];

  return (
    <div className="pt-28 pb-24 min-h-screen bg-[#0A2540]" ref={topRef}>
      <div className="container mx-auto px-6 max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-[#FFD700] mb-4">
            Sell Your Business or Property Portfolio
          </h1>
          <p className="text-white/80 text-lg max-w-2xl mx-auto">
            We're looking for UK businesses with <strong className="text-white">£1M+ revenue and £200k+ profit</strong>,
            or property portfolios of <strong className="text-white">£1M+ held in a company/SPV</strong> —
            to acquire directly, or to match with our vetted network of buyers.
          </p>
          <p className="inline-flex items-center text-white/60 text-sm mt-4">
            <ShieldCheck className="h-4 w-4 mr-2 text-[#FFD700]" />
            Everything you share is treated in strict confidence.
          </p>
        </div>

        {step === 0 && <VideoSlot url={INTRO_VIDEO_URL} caption="Watch: how this works, from Sandeep" />}

        <div className="mb-10">
          <div className="flex justify-between mb-2">
            {STEP_LABELS.map((label, i) => (
              <span key={label} className={'text-xs sm:text-sm ' + (i <= step ? 'text-[#FFD700]' : 'text-white/40')}>
                {label}
              </span>
            ))}
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FFD700] rounded-full transition-all duration-500"
              style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
            ></div>
          </div>
        </div>

        {phase === 'error' && (
          <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-4 mb-8 text-red-300 flex items-start">
            <AlertTriangle className="h-5 w-5 mr-3 mt-0.5 shrink-0" />
            <div>
              {submitError}
              <button onClick={() => setPhase('form')} className="block underline mt-1">Try again</button>
            </div>
          </div>
        )}

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-10 space-y-8">
          {/* ============ STEP 0 — ABOUT YOU ============ */}
          {step === 0 && (
            <>
              <Field label="Your name" required error={errors.submitter_name}>
                <TextInput value={form.submitter_name} onChange={set('submitter_name')} placeholder="Full name" />
              </Field>
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="Email" required error={errors.email}>
                  <TextInput type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
                </Field>
                <Field label="Phone number" required error={errors.phone}>
                  <PhoneInput value={form.phone} onChange={set('phone')} />
                </Field>
              </div>
              <Field label="Are you the owner, a broker/advisor, or other?" required error={errors.submitter_role}>
                <RadioPills
                  value={form.submitter_role}
                  onChange={set('submitter_role')}
                  options={[
                    { value: 'owner', label: 'Owner' },
                    { value: 'broker', label: 'Broker / advisor' },
                    { value: 'other', label: 'Other' },
                  ]}
                />
              </Field>
              <Field
                label="Your role / position"
                required
                help="e.g. founder, majority shareholder, managing director, director of the SPV"
                error={errors.role_in_business}
              >
                <TextInput value={form.role_in_business} onChange={set('role_in_business')} placeholder="Your role" />
              </Field>
              {form.submitter_role === 'owner' && (
                <Field
                  label="Your ownership stake"
                  required
                  help="How much of the business/SPV do you personally own? Drag the slider."
                >
                  <Slider value={form.ownership_stake_pct} onChange={set('ownership_stake_pct')} />
                </Field>
              )}
              {form.submitter_role === 'broker' && (
                <Field label="Company / firm name">
                  <TextInput value={form.firm_name} onChange={set('firm_name')} placeholder="Your firm" />
                </Field>
              )}
              {notOwner && (
                <div className="grid md:grid-cols-2 gap-6">
                  <Field label="Owner's name" required error={errors.owner_name}>
                    <TextInput value={form.owner_name} onChange={set('owner_name')} />
                  </Field>
                  <Field label="Owner's contact details" required help="Email or phone — a direct line to the decision-maker" error={errors.owner_contact}>
                    <TextInput value={form.owner_contact} onChange={set('owner_contact')} />
                  </Field>
                </div>
              )}
              <Field label="How did you hear about us?">
                <SelectInput value={form.heard_via} onChange={set('heard_via')} options={HEARD_VIA_OPTIONS} placeholder="Optional — select one" />
              </Field>

              <div className="border-t border-white/10 pt-8">
                <Field label="What are you submitting?" required error={errors.type}>
                  <div className="grid md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => set('type')('business')}
                      className={
                        'p-6 rounded-2xl border text-left transition-all ' +
                        (isBusiness ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/15 bg-white/5 hover:bg-white/10')
                      }
                    >
                      <Building2 className={'h-8 w-8 mb-3 ' + (isBusiness ? 'text-[#FFD700]' : 'text-white/60')} />
                      <div className="text-white font-bold mb-1">A trading business</div>
                      <div className="text-white/60 text-sm">£1M+ revenue and £200k+ net profit</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => set('type')('property')}
                      className={
                        'p-6 rounded-2xl border text-left transition-all ' +
                        (isProperty ? 'border-[#FFD700] bg-[#FFD700]/10' : 'border-white/15 bg-white/5 hover:bg-white/10')
                      }
                    >
                      <HomeIcon className={'h-8 w-8 mb-3 ' + (isProperty ? 'text-[#FFD700]' : 'text-white/60')} />
                      <div className="text-white font-bold mb-1">A property portfolio</div>
                      <div className="text-white/60 text-sm">£1M+ value, held in a company / SPV</div>
                    </button>
                  </div>
                </Field>
              </div>
            </>
          )}

          {/* ============ STEP 1 — BUSINESS ============ */}
          {step === 1 && isBusiness && (
            <>
              <h2 className="text-2xl font-serif font-bold text-white">The business</h2>
              <Field label="Business / trading name" required error={errors.business_name}>
                <TextInput value={form.business_name} onChange={set('business_name')} />
              </Field>
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="Companies House number" required help="8 characters — used for verification" error={errors.companies_house_number}>
                  <TextInput value={form.companies_house_number} onChange={set('companies_house_number')} placeholder="e.g. 01234567" />
                </Field>
                <Field label="Website / online presence">
                  <TextInput value={form.website} onChange={set('website')} placeholder="https://…" />
                </Field>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="Sector / industry" required error={errors.sector}>
                  <SelectInput value={form.sector} onChange={set('sector')} options={SECTORS} />
                </Field>
                <Field label="Year established">
                  <SelectInput value={form.year_established} onChange={set('year_established')} options={YEAR_OPTIONS} />
                </Field>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="Location (region)" required error={errors.region}>
                  <SelectInput value={form.region} onChange={set('region')} options={UK_REGIONS} />
                </Field>
                <Field label="Number of employees">
                  <SelectInput value={form.employees} onChange={set('employees')} options={EMPLOYEE_RANGES} />
                </Field>
              </div>
              <Field label="What does the business do?" required error={errors.description}>
                <textarea
                  value={form.description}
                  onChange={(e) => set('description')(e.target.value)}
                  placeholder="A short description"
                  rows={4}
                  className={inputClass + ' resize-y'}
                />
              </Field>
            </>
          )}

          {/* ============ STEP 1 — PROPERTY ============ */}
          {step === 1 && isProperty && (
            <>
              <h2 className="text-2xl font-serif font-bold text-white">The structure</h2>
              <Field label="Is the portfolio held in a limited company / SPV?" required error={errors.is_spv}>
                <RadioPills
                  value={form.is_spv}
                  onChange={set('is_spv')}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
                {form.is_spv === 'no' && (
                  <p className="text-amber-300/90 text-sm mt-3 flex items-start">
                    <AlertTriangle className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
                    Without a company/SPV the deal can't be done as a share purchase, so the SDLT saving doesn't apply.
                    You can still submit — we'll review it on its merits.
                  </p>
                )}
              </Field>
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="SPV / company name" required error={errors.spv_name}>
                  <TextInput value={form.spv_name} onChange={set('spv_name')} />
                </Field>
                <Field label="Companies House number" required help="Confirms the structure" error={errors.companies_house_number}>
                  <TextInput value={form.companies_house_number} onChange={set('companies_house_number')} placeholder="e.g. 01234567" />
                </Field>
              </div>
              <div className="grid md:grid-cols-[2fr_1fr] gap-6">
                <Field label="Postal address for correspondence" help="Optional — where we can write to you. If left blank we use the company's registered office.">
                  <TextInput value={form.postal_address} onChange={set('postal_address')} placeholder="Street, town" />
                </Field>
                <Field label="Postcode">
                  <TextInput value={form.postal_postcode} onChange={set('postal_postcode')} placeholder="e.g. NP18 1JF" />
                </Field>
              </div>
              <Field label="Are you selling 100% of the shares?" required error={errors.selling_100pct}>
                <RadioPills
                  value={form.selling_100pct}
                  onChange={set('selling_100pct')}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
              </Field>
            </>
          )}

          {/* ============ STEP 2 — BUSINESS NUMBERS + DEAL ============ */}
          {step === 2 && isBusiness && (
            <>
              <h2 className="text-2xl font-serif font-bold text-white">The numbers</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="Annual revenue (last full year)" required error={errors.revenue}>
                  <MoneyInput value={form.revenue} onChange={set('revenue')} placeholder="1,500,000" />
                </Field>
                <Field
                  label="Net profit / EBITDA (last full year)"
                  required
                  help="Profit after all costs and director's salary"
                  error={errors.net_profit}
                >
                  <MoneyInput value={form.net_profit} onChange={set('net_profit')} placeholder="300,000" />
                </Field>
              </div>
              <Field label="Revenue trend">
                <RadioPills
                  value={form.revenue_trend}
                  onChange={set('revenue_trend')}
                  options={[
                    { value: 'growing', label: 'Growing' },
                    { value: 'flat', label: 'Flat' },
                    { value: 'declining', label: 'Declining' },
                  ]}
                />
              </Field>
              <Field label="Roughly how much of your revenue is recurring?" help="Contracts, subscriptions, repeat clients — drag to set (optional)">
                <Slider value={form.recurring_pct} onChange={set('recurring_pct')} optional />
              </Field>
              <Field label="Does any one client exceed ~25% of revenue?">
                <RadioPills
                  value={form.customer_concentration}
                  onChange={set('customer_concentration')}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
              </Field>
              <Field label="Reason for sale" required error={errors.reason_for_sale}>
                <SelectInput
                  value={form.reason_for_sale}
                  onChange={set('reason_for_sale')}
                  options={['Retirement', 'New venture / moving on', 'Health or family reasons', 'Partnership / shareholder change', 'Market conditions', 'Other']}
                />
              </Field>

              <h2 className="text-2xl font-serif font-bold text-white pt-4 border-t border-white/10">Deal expectations</h2>
              <Field label="Asking price / valuation expectation" required error={errors.asking_price}>
                <MoneyInput value={form.asking_price} onChange={set('asking_price')} placeholder="1,400,000" />
              </Field>
              <Field
                label="How much do you need in cash on day one to walk away comfortable?"
                required
                help="To retire or do whatever's next — this helps us structure a deal that works for you"
                error={errors.day_one_cash_need}
              >
                <MoneyInput value={form.day_one_cash_need} onChange={set('day_one_cash_need')} placeholder="600,000" />
              </Field>
              <Field label="Open to part of the price being deferred or tied to performance (earn-out)?">
                <RadioPills
                  value={form.open_to_deferred}
                  onChange={set('open_to_deferred')}
                  options={[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                    { value: 'maybe', label: 'Maybe' },
                  ]}
                />
              </Field>
              <Field label="Would you consider staying on for a handover period?">
                <RadioPills
                  value={form.handover_willing}
                  onChange={set('handover_willing')}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
                {form.handover_willing === 'yes' && (
                  <div className="mt-3">
                    <SelectInput
                      value={form.handover_period}
                      onChange={set('handover_period')}
                      options={['Up to 1 month', '1–3 months', '3–6 months', '6–12 months', 'Over a year — flexible']}
                      placeholder="How long?"
                    />
                  </div>
                )}
              </Field>
            </>
          )}

          {/* ============ STEP 2 — PROPERTY PORTFOLIO + DEAL ============ */}
          {step === 2 && isProperty && (
            <>
              <h2 className="text-2xl font-serif font-bold text-white">The portfolio</h2>
              <Field label="Total portfolio value / valuation" required error={errors.portfolio_value}>
                <MoneyInput value={form.portfolio_value} onChange={set('portfolio_value')} placeholder="2,000,000" />
              </Field>
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="Property type" required error={errors.property_type}>
                  <RadioPills
                    value={form.property_type}
                    onChange={set('property_type')}
                    options={[
                      { value: 'commercial', label: 'Commercial' },
                      { value: 'residential', label: 'Residential' },
                      { value: 'mixed', label: 'Mixed' },
                    ]}
                  />
                </Field>
                <Field label="Number of properties / units" required error={errors.num_units}>
                  <NumberInput value={form.num_units} onChange={set('num_units')} placeholder="e.g. 11" />
                </Field>
              </div>
              <Field label="Locations / regions" required help="Tap all that apply" error={errors.locations}>
                <div className="flex flex-wrap gap-2">
                  {UK_REGIONS.filter((r) => r !== 'Multiple regions').map((region) => (
                    <button
                      key={region}
                      type="button"
                      onClick={() => toggleLocation(region)}
                      className={
                        'px-4 py-2 rounded-full text-sm font-medium transition-all border ' +
                        (selectedLocations.includes(region)
                          ? 'bg-[#FFD700] text-[#0A2540] border-[#FFD700]'
                          : 'bg-white/5 text-white border-white/15 hover:bg-white/10')
                      }
                    >
                      {region}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="Gross annual rental income">
                  <MoneyInput value={form.gross_rent} onChange={set('gross_rent')} placeholder="180,000" />
                </Field>
                <Field label="Net annual income after costs">
                  <MoneyInput value={form.net_income} onChange={set('net_income')} placeholder="120,000" />
                </Field>
              </div>
              <Field label="Occupancy — what % of units are currently let?" help="Drag to set (optional)">
                <Slider value={form.void_rate} onChange={set('void_rate')} optional />
              </Field>
              <div className="grid md:grid-cols-2 gap-6">
                <Field label="Outstanding debt / mortgages on the SPV">
                  <MoneyInput value={form.outstanding_debt} onChange={set('outstanding_debt')} placeholder="1,100,000" />
                </Field>
                <Field label="Rough loan-to-value" help="Drag to set (optional)">
                  <Slider value={form.ltv} onChange={set('ltv')} optional />
                </Field>
              </div>
              <Field label="Reason for sale" required error={errors.reason_for_sale}>
                <SelectInput
                  value={form.reason_for_sale}
                  onChange={set('reason_for_sale')}
                  options={['Retirement', 'Releasing capital for other investments', 'Simplifying my affairs', 'Tax or regulatory changes', 'Partnership / shareholder change', 'Other']}
                />
              </Field>

              <h2 className="text-2xl font-serif font-bold text-white pt-4 border-t border-white/10">Deal expectations</h2>
              <Field label="Asking price / share valuation expectation" required error={errors.asking_price}>
                <MoneyInput value={form.asking_price} onChange={set('asking_price')} placeholder="2,200,000" />
              </Field>
              <Field
                label="How much do you need in cash on day one to walk away comfortable?"
                required
                help="To retire or do whatever's next — this helps us structure a deal that works for you"
                error={errors.day_one_cash_need}
              >
                <MoneyInput value={form.day_one_cash_need} onChange={set('day_one_cash_need')} placeholder="900,000" />
              </Field>
              <Field label="Open to part of the price being deferred or staged?">
                <RadioPills
                  value={form.open_to_deferred}
                  onChange={set('open_to_deferred')}
                  options={[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                    { value: 'maybe', label: 'Maybe' },
                  ]}
                />
              </Field>
            </>
          )}

          {/* ============ STEP 3 — DOCUMENTS + CONSENT ============ */}
          {step === 3 && (
            <>
              <h2 className="text-2xl font-serif font-bold text-white">Supporting material</h2>
              <p className="text-white/70 -mt-4">
                Optional but encouraged — <strong className="text-white">the more complete your information, the faster and better the assessment.</strong>
              </p>
              <Field
                label="Upload documents"
                help={
                  isBusiness
                    ? 'Last 2–3 years accounts, P&L, info memorandum, management accounts (PDF, Word, Excel — max 10MB each)'
                    : 'Rent roll / tenancy schedule, valuations/RICS reports, SPV accounts, property schedule (PDF, Word, Excel — max 10MB each)'
                }
                error={errors.files}
              >
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="w-full border-2 border-dashed border-white/20 rounded-2xl p-8 text-center hover:border-[#FFD700]/60 hover:bg-white/5 transition-all"
                >
                  <Upload className="h-8 w-8 text-[#FFD700] mx-auto mb-3" />
                  <span className="text-white/80">Click to choose files (up to 10)</span>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                />
                {files.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2 text-white/80 text-sm">
                        <span className="truncate mr-3">{f.name}</span>
                        <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                          <X className="h-4 w-4 text-white/50 hover:text-white" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
              <Field label="Any links" help="Data room, website, listings">
                <TextInput value={form.links} onChange={set('links')} placeholder="https://…" />
              </Field>
              <Field label="Anything else we should know?">
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes')(e.target.value)}
                  rows={4}
                  className={inputClass + ' resize-y'}
                />
              </Field>

              <div className="bg-[#FFD700]/5 border border-[#FFD700]/25 rounded-2xl p-5">
                <label className="flex items-start cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.network_optin}
                    onChange={(e) => set('network_optin')(e.target.checked)}
                    className="mt-1 mr-3 h-5 w-5 accent-[#FFD700]"
                  />
                  <span className="text-white/90 text-sm">
                    <strong className="text-white">Reach more buyers.</strong> If this isn't a direct fit for us,
                    I'm happy for Officially Invested to discreetly present it to their vetted network of buyers
                    and investors. This only ever happens after their own review process, with your details kept
                    confidential until you say otherwise.
                  </span>
                </label>
              </div>

              <div className="border-t border-white/10 pt-6 space-y-4">
                <label className="flex items-start cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.consent}
                    onChange={(e) => set('consent')(e.target.checked)}
                    className="mt-1 mr-3 h-5 w-5 accent-[#FFD700]"
                  />
                  <span className="text-white/80 text-sm">
                    I consent to Officially Invested storing and reviewing this information. Your data is handled
                    confidentially and in line with GDPR. <span className="text-[#FFD700]">*</span>
                  </span>
                </label>
                {errors.consent && <p className="text-red-400 text-sm">{errors.consent}</p>}
                <label className="flex items-start cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.marketing_optin}
                    onChange={(e) => set('marketing_optin')(e.target.checked)}
                    className="mt-1 mr-3 h-5 w-5 accent-[#FFD700]"
                  />
                  <span className="text-white/80 text-sm">I'd like to receive relevant opportunities and updates (optional).</span>
                </label>
              </div>

              {!eligiblePreview && form.type && (
                <p className="text-white/50 text-sm">
                  Heads up: based on the figures you've entered, this sits below our usual acquisition criteria.
                  You can still submit — we review everything, and we'll point you to some resources that may help.
                </p>
              )}
            </>
          )}

          {/* ============ NAV ============ */}
          <div className="flex justify-between pt-4 border-t border-white/10">
            {step > 0 ? (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center text-white/70 hover:text-white px-6 py-3 rounded-full font-semibold transition-colors"
                disabled={phase === 'submitting'}
              >
                <ArrowLeft className="mr-2 h-5 w-5" /> Back
              </button>
            ) : <span />}

            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                className="group inline-flex items-center bg-[#FFD700] text-[#0A2540] px-8 py-3 rounded-full font-semibold hover:bg-opacity-90 transition-all"
              >
                Continue
                <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={phase === 'submitting'}
                className="inline-flex items-center bg-[#FFD700] text-[#0A2540] px-8 py-3 rounded-full font-semibold hover:bg-opacity-90 transition-all disabled:opacity-60"
              >
                {phase === 'submitting' ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Submitting…</>
                ) : (
                  'Submit'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-28 pb-24 min-h-screen bg-[#0A2540]">
      <div className="container mx-auto px-6 max-w-3xl text-center">{children}</div>
    </div>
  );
}
