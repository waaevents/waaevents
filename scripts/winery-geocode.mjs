// Turns each winery's street address into map coordinates using OpenStreetMap's
// Nominatim geocoder. Addresses come from the listing note or from
// data/winery-addresses.json (found on the winery's own website). Wineries with
// no address get a name search limited to Woodinville. Output:
// data/winery-geo.json -> { "Winery": { lat, lng, address, precision } }
import { readFile, writeFile } from 'node:fs/promises';

const UA = 'woodinville-events-map/1.0 (https://github.com/waaevents/waaevents)';
const BOX = { minLat: 47.70, maxLat: 47.80, minLng: -122.21, maxLng: -122.09 };
const STREET = '(?:NE\\s+)?\\d{2,3}(?:st|nd|rd|th)\\s+(?:Ave|Pl|St)(?:\\s+NE)?|(?:Woodinville|Redmond)[- ](?:Redmond|Woodinville)\\s+Rd(?:\\s+NE)?|Woodinville[- ]Snohomish\\s+Rd|NE\\s+Village\\s+Square\\s+Dr|NE\\s+Woodinville\\s+Dr|Woodinville[- ]Duvall\\s+Rd|Garden\\s+Way\\s+NE';
const RE = new RegExp(`(\\d{4,5})\\s+(${STREET})`, 'i');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function nominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=us&addressdetails=1&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const inBox = (p) => p.lat >= BOX.minLat && p.lat <= BOX.maxLat && p.lng >= BOX.minLng && p.lng <= BOX.maxLng;

function addressOf(w, found, manual = {}) {
  if (manual[w.name]) return manual[w.name];
  const fromNote = (w.note || '').match(RE);
  if (fromNote) return fromNote[0].replace(/\s+/g, ' ');
  const f = found[w.name]?.address;
  const m = f && f.match(RE);
  return m ? m[0].replace(/\s+/g, ' ') : null;
}

async function main() {
  const data = JSON.parse(await readFile('data/wineries.json', 'utf8'));
  let found = {};
  try { found = JSON.parse(await readFile('data/winery-addresses.json', 'utf8')).addresses || {}; } catch { /* none */ }
  let manual = {};
  try { manual = JSON.parse(await readFile('data/winery-addresses-manual.json', 'utf8')).addresses || {}; } catch { /* none */ }
  let prev = {};
  try { prev = JSON.parse(await readFile('data/winery-geo.json', 'utf8')).places || {}; } catch { /* first run */ }
  const places = {}; const missing = [];
  for (const d of data.districts) {
    for (const w of d.wineries) {
      if (prev[w.name]?.lat && prev[w.name].precision !== 'name-search' && !(manual[w.name] && prev[w.name].address !== manual[w.name])) { places[w.name] = prev[w.name]; continue; }
      const addr = addressOf(w, found, manual);
      let hit = null;
      try {
        if (addr) {
          const res = await nominatim(`${addr}, Woodinville, WA`);
          await sleep(1100);
          for (const x of res) {
            const p = { lat: +x.lat, lng: +x.lon };
            if (inBox(p)) { hit = { ...p, address: addr, precision: x.addresstype === 'road' || x.category === 'highway' ? 'street' : 'address' }; break; }
          }
          if (!hit) {
            const road = addr.replace(/^\d+\s+/, '');
            const res2 = await nominatim(`${road}, Woodinville, WA`);
            await sleep(1100);
            for (const x of res2) { const p = { lat: +x.lat, lng: +x.lon }; if (inBox(p)) { hit = { ...p, address: addr, precision: 'street' }; break; } }
          }
        } else {
          const res = await nominatim(`${w.name}, Woodinville, WA`);
          await sleep(1100);
          const word = w.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ')[0];
          for (const x of res) {
            const p = { lat: +x.lat, lng: +x.lon };
            if (inBox(p) && (x.display_name || '').toLowerCase().includes(word)) { hit = { ...p, address: null, precision: 'name-search' }; break; }
          }
        }
      } catch (e) { console.error(w.name, e.message); await sleep(2000); }
      if (hit) places[w.name] = hit; else missing.push(w.name);
    }
  }
  await writeFile('data/winery-geo.json', JSON.stringify({ generatedAt: new Date().toISOString(), places, missing }, null, 2) + '\n');
  const pr = Object.values(places).reduce((a, p) => ((a[p.precision] = (a[p.precision] || 0) + 1), a), {});
  console.log(`Located ${Object.keys(places).length}, missing ${missing.length}`, pr);
}
main().catch((e) => { console.error(e); process.exit(1); });
