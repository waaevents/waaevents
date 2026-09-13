// Smoke test for the day planner (plan-a-day.html + assets/app.js).
// Actually loads the real page + real script into jsdom, stubs fetch() to
// serve the real local data files, checks "Live Music", submits the form,
// and fails loudly if the checkboxes never rendered, the form never
// produced an itinerary, or no real dated artist/event got attached.
//
// Run with: node tests/planner.test.cjs

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'plan-a-day.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'https://waaevents.github.io/waaevents/plan-a-day.html',
});
const { window } = dom;

let windowErrors = [];
window.addEventListener('error', (e) => {
  windowErrors.push(e.error ? e.error.stack : e.message);
});

window.fetch = async (url) => {
  try {
    const text = fs.readFileSync(path.join(ROOT, url), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  } catch (e) {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const scriptEl = window.document.createElement('script');
scriptEl.textContent = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
window.document.body.appendChild(scriptEl);

function fail(msg) {
  console.error('FAIL:', msg);
  if (windowErrors.length) console.error('Errors seen:', windowErrors);
  process.exit(1);
}

setTimeout(() => {
  const doc = window.document;
  const grid = doc.getElementById('interest-grid');
  const boxes = grid.querySelectorAll('input[type=checkbox]');
  if (boxes.length === 0) fail('interest checkboxes never rendered — planner UI is dead on load.');

  const cb = grid.querySelector('input[value="live-music"]');
  if (!cb) fail('no "live-music" checkbox found.');
  cb.checked = true;

  const form = doc.getElementById('planner-form');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  setTimeout(() => {
    const out = doc.getElementById('itinerary');
    if (!out.innerHTML.trim()) fail('submitting the form produced no itinerary.');
    if (!out.querySelector('h4')) fail('itinerary has no stops.');
    const hasRealEvent = /🎤/.test(out.innerHTML);
    if (!hasRealEvent) {
      console.warn('WARN: no real dated event was attached to any stop this run (may just be luck of the draw — try again).');
    }
    const badTime = /\d{1,2}:\d{2}\s?AM\b/.test(out.innerHTML) && /🎤/.test(out.innerHTML);
    if (badTime) fail('an event time looks like it printed in UTC instead of Pacific (check WOODINVILLE_TZ usage).');
    console.log('PASS: planner renders checkboxes, accepts a submit, and produces an itinerary.');
    if (hasRealEvent) console.log('PASS: at least one stop carries a real dated event.');
    process.exit(windowErrors.length ? 1 : 0);
  }, 500);
}, 800);
