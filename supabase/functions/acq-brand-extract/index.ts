// acq-brand-extract — pull brand name, colour and logo from a customer's website
// so the brand settings can be prefilled from a link. Best-effort parse of the
// page's theme-color / og tags / icons. Returns values for the user to confirm.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function pickColor(html: string): string | null {
  const counts: Record<string, number> = {};
  const tc = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']\s*(#[0-9a-fA-F]{6})/i);
  if (tc) return tc[1];
  const re = /#([0-9a-fA-F]{6})\b/g; let m: RegExpExecArray | null;
  while ((m = re.exec(html))) counts[m[1].toLowerCase()] = (counts[m[1].toLowerCase()] || 0) + 1;
  const ranked = Object.entries(counts).filter(([h]) => {
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const light = (r + g + b) / 3, max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (light > 232 || light < 18) return false;           // near white/black
    if (max - min < 14) return false;                       // greys
    return true;
  }).sort((a, b) => b[1] - a[1]);
  return ranked.length ? '#' + ranked[0][0] : null;
}

function abs(href: string, base: URL): string { try { return new URL(href, base).href; } catch { return href; } }

// ---- SSRF guard: this function fetches user-supplied URLs server-side, so it
// must never reach loopback, private, link-local or cloud-metadata addresses -
// neither directly, via redirect, nor via a hostname that resolves there.
const PRIVATE_HOST = /^(localhost|(.+\.)?(local|internal|localhost|home\.arpa))$/i;
function isPrivateIp(host: string): boolean {
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2]);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h.includes(':')) return h === '::' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
  return false;
}
function safeUrl(raw: string): URL | null {
  let u: URL; try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (PRIVATE_HOST.test(u.hostname) || isPrivateIp(u.hostname)) return null;
  return u;
}
async function resolvesPrivate(host: string): Promise<boolean> {
  if (isPrivateIp(host)) return true;
  const lookups = await Promise.allSettled([Deno.resolveDns(host, 'A'), Deno.resolveDns(host, 'AAAA')]);
  for (const l of lookups) if (l.status === 'fulfilled') for (const ip of l.value) if (isPrivateIp(ip)) return true;
  return false;
}
/** fetch() that refuses non-public origins before and after redirects, with a timeout */
async function fetchPublic(u: URL, ua: string): Promise<Response | null> {
  if (await resolvesPrivate(u.hostname)) return null;
  const r = await fetch(u.href, { headers: { 'User-Agent': ua }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  const final = safeUrl(r.url || u.href);
  if (!final || await resolvesPrivate(final.hostname)) return null;
  const len = Number(r.headers.get('content-length') || 0);
  if (len > 5_000_000) return null;
  return r;
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const u = safeUrl(url);
    if (!u) return null;
    const r = await fetchPublic(u, 'Mozilla/5.0');
    if (!r) return null;
    const ct = r.headers.get('content-type') || '';
    if (!/image\/(png|jpe?g|webp|svg)/i.test(ct)) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > 400_000) return null;
    let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const mime = ct.split(';')[0];
    return `data:${mime};base64,${btoa(bin)}`;
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({} as any));
    // auth: a signed-in user is always required. (The previous "internal secret"
    // shortcut only checked that the header was PRESENT, never its value, and no
    // server-side caller uses this function - so it was an open bypass.)
    const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data } = await sb.auth.getUser();
    if (!data?.user) return json({ error: 'unauthorised' }, 401);

    let raw = String(body.url || '').trim();
    if (!raw) return json({ error: 'url required' }, 400);
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    const base = safeUrl(raw);
    if (!base) return json({ error: 'url must be a public http(s) website address' }, 400);
    const res = await fetchPublic(base, 'Mozilla/5.0 (compatible; OfficiallyInvestedBot/1.0)');
    if (!res) return json({ error: 'that address is not a public website' }, 400);
    if (!res.ok) return json({ error: 'could not fetch site (' + res.status + ')' }, 502);
    const html = (await res.text()).slice(0, 600_000);

    const name = (html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1]
      || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim().replace(/\s*[|\-–].*$/, '').slice(0, 60) || null;
    const color = pickColor(html);

    // logo candidates in priority order
    const cands: string[] = [];
    const push = (h?: string | null) => { if (h) cands.push(abs(h, base)); };
    push(html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1]);
    push(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]);
    const imgLogo = html.match(/<img[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*(?:alt|class|id)=["'][^"']*logo[^"']*["']/i)
      || html.match(/<img[^>]*(?:alt|class|id)=["'][^"']*logo[^"']*["'][^>]*(?:src|data-src)=["']([^"']+)["']/i);
    push(imgLogo?.[1]);
    push(html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)?.[1]);

    let logo: string | null = null;
    for (const c of cands) { logo = await toDataUrl(c); if (logo) break; }

    return json({ ok: true, brand: { name, color, logo }, source: base.href });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
