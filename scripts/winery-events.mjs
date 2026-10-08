// Discovers and fetches upcoming events from each winery/venue's own website
// listed in data/wineries.json. Writes data/winery-events.json, which
// scripts/update-events.mjs then merges into data/events.json.
//
// Nothing here is hand-guessed per winery: for each site we look for the
// events/calendar page, then try, in order, (1) The Events Calendar (WordPress)
// REST API, (2) Squarespace's ?format=json, (3) an iCal feed linked from the
// page, (4) schema.org Event JSON-LD. A site only counts as "ok" if one of
// those actually returns future events. Everything else is recorded in the
// report with the platform we saw, so it can be handled by hand.

import ical from 'node-ical';
import { readFile, writeFile } from 'node:fs/promises';

const WINDOW_DAYS = 90;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PROBE_PATHS = ['/events', '/calendar', '/events/list/', '/event-calendar', '/whats-happening', '/upcoming-events'];
const OTHER_CITIES = /\b(seattle|bellevue|redmond|kirkland|prosser|walla walla|leavenworth|richland|benton city|issaquah|bothell|kenmore|mercer island|tacoma|yakima|zillah|west seattle|queen anne|snohomish|lake stevens|everett|spokane|chelan|woodinville-snohomish)\b/i;

async function get(url, accept = 'text/html,application/xhtml+xml,*/*', timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { text: await res.text(), url: res.url };
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

// "2026-10-10T13:00:00" with no zone is Pacific wall-clock time.
function parseWhen(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v);
  const s = String(v).trim();
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) return new Date(s);
  const m = s.match(/^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/);
  if (!m) return new Date(s);
  const [, y, mo, d, h = '12', mi = '00'] = m;
  for (const off of [7, 8]) {
    const guess = new Date(Date.UTC(+y, +mo - 1, +d, +h + off, +mi));
    const hour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hourCycle: 'h23' }).format(guess);
    if (+hour === +h) return guess;
  }
  return new Date(Date.UTC(+y, +mo - 1, +d, +h + 7, +mi));
}

function locString(loc) {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  if (Array.isArray(loc)) return loc.map(locString).join(', ');
  const a = loc.address;
  const addr = typeof a === 'string' ? a : a ? [a.streetAddress, a.addressLocality, a.addressRegion].filter(Boolean).join(', ') : '';
  return [loc.name, addr].filter(Boolean).join(', ');
}

function norm(e) {
  const start = parseWhen(e.start);
  if (!start || Number.isNaN(start.getTime())) return null;
  return {
    title: stripHtml(e.title).slice(0, 160),
    start: start.toISOString(),
    location: stripHtml(e.location).slice(0, 200),
    url: e.url || '',
    description: stripHtml(e.description).slice(0, 280),
  };
}

// ---- strategies: each returns an array of raw events (possibly empty) ----

async function tribe(origin) {
  const today = new Date().toISOString().slice(0, 10);
  const { text } = await get(`${origin}/wp-json/tribe/events/v1/events?per_page=50&start_date=${today}`, 'application/json');
  const j = JSON.parse(text);
  return (j.events || []).map((e) => ({
    title: e.title,
    start: e.utc_start_date ? `${e.utc_start_date.replace(' ', 'T')}Z` : e.start_date,
    location: [e.venue?.venue, e.venue?.address, e.venue?.city].filter(Boolean).join(', '),
    url: e.url,
    description: e.description || e.excerpt,
  }));
}

async function squarespace(pageUrl) {
  const u = pageUrl + (pageUrl.includes('?') ? '&' : '?') + 'format=json';
  const { text } = await get(u, 'application/json');
  const j = JSON.parse(text);
  const items = j.upcoming || j.items || [];
  const origin = new URL(pageUrl).origin;
  return items
    .filter((i) => i.startDate)
    .map((i) => ({
      title: i.title,
      start: i.startDate,
      location: i.location ? [i.location.addressTitle, i.location.addressLine1, i.location.addressLine2].filter(Boolean).join(', ') : '',
      url: i.fullUrl ? origin + i.fullUrl : '',
      description: i.excerpt || i.body,
    }));
}

async function icsFeed(url) {
  const { text } = await get(url.replace(/^webcal:/i, 'https:'), 'text/calendar,*/*');
  const data = ical.sync.parseICS(text);
  return Object.values(data)
    .filter((e) => e && e.type === 'VEVENT' && e.start)
    .map((e) => ({ title: e.summary, start: e.start.tz || e.start.dateOnly ? new Date(e.start).toISOString() : e.start.toISOString().slice(0, 19), location: e.location, url: e.url, description: e.description }));
}

function jsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const t = [].concat(n['@type'] || []);
    if (t.some((x) => /Event$/.test(String(x))) && n.startDate) {
      out.push({ title: n.name, start: n.startDate, location: locString(n.location), url: typeof n.url === 'string' ? n.url : '', description: n.description });
    }
    for (const k of ['@graph', 'itemListElement', 'item', 'subEvent', 'event']) if (n[k]) walk(n[k]);
  };
  while ((m = re.exec(html))) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* ignore bad JSON-LD */ }
  }
  return out;
}

function findLinks(html, base) {
  const links = [];
  const re = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = stripHtml(m[2]).toLowerCase();
    const href = m[1];
    if (/private|wedding|club|shop|cart|account|login|reserv|book|gift|blog|press|career|job/i.test(href + ' ' + text)) continue;
    if (!/event|calendar|happening|what.?s-?on|upcoming|live-?music|schedule/i.test(href + ' ' + text)) continue;
    try {
      const u = new URL(href, base);
      if (/^https?:$/.test(u.protocol)) links.push(u);
    } catch { /* ignore */ }
  }
  return links;
}

function platformOf(html) {
  if (/squarespace/i.test(html)) return 'squarespace';
  if (/wix\.com|wixstatic/i.test(html)) return 'wix';
  if (/shopify/i.test(html)) return 'shopify';
  if (/tribe-events|wp-content|wordpress/i.test(html)) return 'wordpress';
  if (/weebly/i.test(html)) return 'weebly';
  return 'other';
}

async function extract(pageUrl, html) {
  const origin = new URL(pageUrl).origin;
  const tried = [];
  const attempt = async (name, fn) => {
    try {
      const ev = await fn();
      tried.push(`${name}:${ev.length}`);
      return ev;
    } catch (e) {
      tried.push(`${name}:err`);
      return [];
    }
  };
  let ev = [];
  if (/tribe|ical=1|wp-content/i.test(html)) {
    ev = await attempt('tribe', () => tribe(origin));
    if (ev.length) return { ev, strategy: 'tribe', tried };
  }
  if (/squarespace/i.test(html)) {
    ev = await attempt('squarespace', () => squarespace(pageUrl));
    if (ev.length) return { ev, strategy: 'squarespace', tried };
  }
  const ics = [...html.matchAll(/href=["']([^"']*(?:\.ics|[?&]ical=1|webcal:)[^"']*)["']/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  for (const link of [...new Set(ics)].slice(0, 2)) {
    try {
      ev = await attempt('ics', () => icsFeed(new URL(link, pageUrl).href));
      if (ev.length) return { ev, strategy: 'ics', tried };
    } catch { /* ignore */ }
  }
  ev = jsonLd(html);
  tried.push(`jsonld:${ev.length}`);
  if (ev.length) return { ev, strategy: 'jsonld', tried };
  return { ev: [], strategy: null, tried };
}

function inWindow(isoStart, now, max) {
  const d = new Date(isoStart);
  return d >= now && d <= max;
}

async function processWinery(w, district) {
  const rep = { winery: w.name, district, url: w.url, status: 'no-events-found' };
  const now = new Date();
  const max = new Date(now.getTime() + WINDOW_DAYS * 864e5);
  let home;
  try {
    home = await get(w.url);
  } catch (e) {
    rep.status = 'site-unreachable';
    rep.error = e.message;
    return { rep, events: [] };
  }
  rep.platform = platformOf(home.text);
  const cands = [];
  const seen = new Set();
  const add = (u) => { const k = u.href.replace(/\/$/, ''); if (!seen.has(k)) { seen.add(k); cands.push(u); } };
  add(new URL(home.url));
  for (const l of findLinks(home.text, home.url)) {
    if (l.hostname.replace(/^www\./, '') === new URL(home.url).hostname.replace(/^www\./, '')) add(l);
  }
  for (const p of PROBE_PATHS) add(new URL(p, home.url));

  for (const c of cands.slice(0, 7)) {
    let html;
    try { html = c.href === home.url ? home.text : (await get(c.href)).text; } catch { continue; }
    const { ev, strategy, tried } = await extract(c.href, html);
    const events = ev
      .map(norm)
      .filter(Boolean)
      .filter((e) => e.title && inWindow(e.start, now, max))
      .filter((e) => !(OTHER_CITIES.test(e.location) && !/woodinville/i.test(e.location)));
    if (events.length) {
      rep.status = 'ok';
      rep.strategy = strategy;
      rep.eventPage = c.href;
      rep.count = events.length;
      return { rep, events: events.slice(0, 60).map((e) => ({ ...e, source: w.name })) };
    }
    rep.lastTried = { page: c.href, tried };
  }
  return { rep, events: [] };
}

async function main() {
  const data = JSON.parse(await readFile(process.env.WINERIES_FILE || 'data/wineries.json', 'utf8'));
  const jobs = [];
  for (const d of data.districts) for (const w of d.wineries) if (w.url) jobs.push([w, d.id]);
  // District/regional calendars list events for many wineries at once.
  for (const a of [
    { name: 'Woodinville Wine Country', url: 'https://woodinvillewinecountry.com/' },
    { name: 'Warehouse Wineries', url: 'https://www.warehousewineries.com/' },
    { name: 'Artisan Hill', url: 'https://www.artisanhill.com/' },
    { name: 'Woodinville Wine Country Events', url: 'https://woodinvillewinecountry.com/events/' },
  ]) jobs.push([a, 'aggregator']);
  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const [w, d] = jobs[i++];
      try {
        results.push(await processWinery(w, d));
      } catch (e) {
        results.push({ rep: { winery: w.name, district: d, url: w.url, status: 'error', error: e.message }, events: [] });
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const events = results.flatMap((r) => r.events);
  const report = results.map((r) => r.rep).sort((a, b) => a.winery.localeCompare(b.winery));
  await writeFile(process.env.WINERY_OUT || 'data/winery-events.json', JSON.stringify({ generatedAt: new Date().toISOString(), count: events.length, report, events }, null, 2) + '\n');
  const by = report.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  console.log(`Winery events: ${events.length} events from ${jobs.length} sites`, by);
}

main().catch((e) => { console.error(e); process.exit(1); });
