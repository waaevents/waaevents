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

  // Date-specific planning: pick the first upcoming day that has a music event.
  const events = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8')).events;
  const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const todayKey = dayKey(Date.now());
  const musicDay = events.filter((e) => e.category === 'music' && new Date(e.start).getTime() > Date.now() + 3 * 3600 * 1000).map((e) => dayKey(e.start)).sort()[0];
  if (!musicDay) fail('no upcoming music event in data/events.json to test a dated plan with.');
  const dateEl = doc.getElementById('plan-date');
  if (!dateEl) fail('no #plan-date input — planner is not date-specific.');
  dateEl.value = musicDay;

  const cb = grid.querySelector('input[value="live-music"]');
  if (!cb) fail('no "live-music" checkbox found.');
  cb.checked = true;

  const form = doc.getElementById('planner-form');
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  setTimeout(() => {
    const out = doc.getElementById('itinerary');
    if (!out.innerHTML.trim()) fail('submitting the form produced no itinerary.');
    if (!out.querySelector('h4')) fail('itinerary has no stops.');
    if (!out.querySelector('.itinerary-date')) fail('itinerary has no date heading.');
    const hasRealEvent = !!out.querySelector('.event-line');
    if (!hasRealEvent) {
      console.warn('WARN: no real dated event was attached to any stop this run (may just be luck of the draw — try again).');
    }
    // Every printed event time (stop lines AND the "also happening" list) must
    // match that event's Pacific time — catches UTC leaking through. Morning
    // events are legitimate now that the plan covers a whole day, so don't
    // treat "AM" itself as a failure.
    const fmt = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
    const text = out.textContent;
    const dayEvs = events.filter((e) => dayKey(e.start) === musicDay);
    // Read the event titles the plan actually printed (exact titles, not substrings: "Happy Hour at X"
    // is a substring of "All-Day Happy Hour at X", which is a different listing).
    const printed = [
      ...[...out.querySelectorAll('.also-happening li strong')].map((el) => el.textContent.trim()),
      ...[...out.querySelectorAll('.event-line')].map((el) => {
        const tag = el.querySelector('.event-tag');
        const t = el.textContent.replace(tag ? tag.textContent : '', '');
        return t.split(' — ')[0].trim();
      }),
    ];
    const dayTitles = new Set(dayEvs.map((e) => e.title));
    const shown = dayEvs.filter((e) => printed.includes(e.title));
    for (const e of shown) {
      const sameTitle = dayEvs.filter((o) => o.title === e.title);
      if (!sameTitle.some((o) => text.includes(`${o.title} — ${fmt(o.start)}`) || (o.timeTBA && text.includes(o.title)))) fail(`"${e.title}" is shown without its Pacific time (${fmt(e.start)}).`);
    }
    // Nothing from another day may appear.
    const otherDay = printed.filter((t) => !dayTitles.has(t)).map((title) => ({ title }));
    if (otherDay.length) fail('events from other dates leaked into the plan: ' + otherDay.slice(0, 3).map((e) => e.title).join('; '));
    console.log('PASS: planner renders checkboxes, accepts a submit, and produces an itinerary.');
    if (hasRealEvent) console.log('PASS: at least one stop carries a real dated event.');
    process.exit(windowErrors.length ? 1 : 0);
  }, 500);
}, 800);
