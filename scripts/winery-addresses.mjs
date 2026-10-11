// Looks up each winery's street address from its own website and writes
// data/winery-addresses.json ({ "Winery name": { address, source } }).
// Only addresses actually found on the winery's pages are recorded.
import { readFile, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PROBES = ['/visit', '/contact', '/contact-us', '/tasting-room', '/locations', '/location', '/find-us', '/about', '/hours'];
const STREET = '(?:NE\\s+)?\\d{2,3}(?:st|nd|rd|th)\\s+(?:Ave|Pl|St|Avenue|Place|Street)(?:\\.)?(?:\\s+NE)?' +
  '|(?:Woodinville|Redmond)[- ](?:Redmond|Woodinville)\\s+Rd\\.?(?:\\s+NE)?|Woodinville[- ]Snohomish\\s+Rd\\.?' +
  '|NE\\s+Village\\s+Square\\s+Dr\\.?|NE\\s+Woodinville\\s+Dr\\.?|Woodinville[- ]Duvall\\s+Rd\\.?|Garden\\s+Way\\s+NE';
const ADDR_RE = new RegExp(`(\\d{4,5})\\s+(${STREET})(?:[,\\s]+(?:#|Suite|Ste\\.?|Unit|Bldg\\.?)\\s*([A-Za-z0-9-]+))?`, 'gi');

async function get(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow', signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { text: await r.text(), url: r.url };
  } finally { clearTimeout(t); }
}

function clean(html) {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&#8212;/g, '-')
    .replace(/\s+/g, ' ');
}

function normalize(num, street, unit) {
  let s = street.replace(/\./g, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:Redmond)[- ]Woodinville\s+Rd.*/i, 'Woodinville-Redmond Rd NE').replace(/^Woodinville[- ]Redmond\s+Rd.*/i, 'Woodinville-Redmond Rd NE');
  s = s.replace(/\bAvenue\b/i, 'Ave').replace(/\bPlace\b/i, 'Pl').replace(/\bStreet\b/i, 'St');
  if (/\d(?:st|nd|rd|th)\s+(Ave|Pl)$/i.test(s)) s += ' NE';
  return `${num} ${s}${unit ? ' ' + (/^\d|^[A-Z]-?\d/i.test(unit) ? '#' : '') + unit : ''}`.trim();
}

function find(text) {
  // Prefer an address followed closely by Woodinville / 98072 (sites with several locations list others too).
  let best = null, m;
  ADDR_RE.lastIndex = 0;
  while ((m = ADDR_RE.exec(text))) {
    const tail = text.slice(m.index, m.index + m[0].length + 60);
    const near = /woodinville|98072/i.test(tail);
    if (near) return normalize(m[1], m[2], m[3]);
    if (!best) best = normalize(m[1], m[2], m[3]);
  }
  return best;
}

function jsonLdAddress(html) {
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const walk = (n) => {
        if (!n || typeof n !== 'object') return null;
        if (Array.isArray(n)) { for (const x of n) { const r = walk(x); if (r) return r; } return null; }
        const a = n.address;
        if (a && typeof a === 'object' && a.streetAddress && /woodinville/i.test(a.addressLocality || '')) return a.streetAddress;
        for (const k of ['@graph', 'location']) { const r = walk(n[k]); if (r) return r; }
        return null;
      };
      const r = walk(JSON.parse(m[1].trim()));
      if (r) return r;
    } catch { /* ignore */ }
  }
  return null;
}

async function lookup(w) {
  const base = new URL(w.url);
  const pages = [base.href];
  let home = null;
  try { home = await get(base.href); } catch (e) { return { error: e.message }; }
  const links = [...home.text.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const [, href, txt] of links) {
    if (!/visit|contact|location|tasting|find|hours|about|reserv/i.test(href + ' ' + clean(txt))) continue;
    try { const u = new URL(href, home.url); if (u.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '')) pages.push(u.href); } catch { /* ignore */ }
  }
  for (const p of PROBES) pages.push(new URL(p, base.origin).href);
  const seen = new Set();
  for (const url of pages) {
    if (seen.has(url) || seen.size >= 8) continue;
    seen.add(url);
    let html;
    try { html = url === base.href ? home.text : (await get(url)).text; } catch { continue; }
    const ld = jsonLdAddress(html);
    if (ld) { const f = find(ld + ' Woodinville 98072'); if (f) return { address: f, source: url }; }
    const f = find(clean(html));
    if (f) return { address: f, source: url };
  }
  return { error: 'no address found' };
}

async function main() {
  const data = JSON.parse(await readFile('data/wineries.json', 'utf8'));
  let prev = {};
  try { prev = JSON.parse(await readFile('data/winery-addresses.json', 'utf8')); } catch { /* first run */ }
  const jobs = [];
  for (const d of data.districts) for (const w of d.wineries) if (w.url) jobs.push(w);
  const out = { ...prev }; const report = {};
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const w = jobs[i++];
      const r = await lookup(w).catch((e) => ({ error: e.message }));
      if (r.address) out[w.name] = { address: r.address, source: r.source };
      else report[w.name] = r.error;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  await writeFile('data/winery-addresses.json', JSON.stringify({ generatedAt: new Date().toISOString(), addresses: Object.fromEntries(Object.entries(out).filter(([k]) => k !== 'generatedAt' && k !== 'addresses')), notFound: report }, null, 2) + '\n');
  console.log(`Found ${Object.keys(out).length}, missing ${Object.keys(report).length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
