// Woodinville Creative Events — front-end rendering
// Reads /data/events.json (regenerated daily by scripts/update-events.mjs)

const DATA_URL = 'data/events.json';

async function loadEvents() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
  return res.json();
}

const WOODINVILLE_TZ = 'America/Los_Angeles';

function formatDay(dateStr) {
  const d = new Date(dateStr);
  return {
    day: d.toLocaleDateString('en-US', { day: 'numeric', timeZone: WOODINVILLE_TZ }),
    month: d.toLocaleDateString('en-US', { month: 'short', timeZone: WOODINVILLE_TZ }),
    full: d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: WOODINVILLE_TZ,
    }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: WOODINVILLE_TZ }),
  };
}

function formatUpdated(iso) {
  if (!iso) return 'not yet run';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: WOODINVILLE_TZ,
  });
}

function setFooterUpdated(iso) {
  document.querySelectorAll('[data-updated]').forEach((el) => {
    el.textContent = formatUpdated(iso);
  });
}

/* ---------- Shared: alphabetical order (ignores a leading "The ") ---------- */
function sortKey(str) {
  return String(str || '').toLowerCase().replace(/^the\s+/, '');
}
const byName = (a, b) => sortKey(a.name).localeCompare(sortKey(b.name));

/* ---------- Homepage: panel counts ---------- */

async function renderHomeCounts() {
  const els = document.querySelectorAll('[data-count-for]');
  if (!els.length) return;
  try {
    const data = await loadEvents();
    const counts = { art: 0, music: 0, comedy: 0, 'food-drink': 0, community: 0, 'game-nights': 0 };
    for (const ev of data.events || []) {
      if (isGameNight(ev)) counts['game-nights'] += 1;
      else if (counts[ev.category] !== undefined) counts[ev.category] += 1;
    }
    els.forEach((el) => {
      const cat = el.getAttribute('data-count-for');
      if (cat === 'breweries') return;
      const n = counts[cat] || 0;
      el.textContent = n === 1 ? '1 upcoming event' : `${n} upcoming events`;
    });
    setFooterUpdated(data.updatedAt);
  } catch (err) {
    els.forEach((el) => { if (el.getAttribute('data-count-for') !== 'breweries') el.textContent = 'Event count unavailable'; });
  }
  const bEl = document.querySelector('[data-count-for="breweries"]');
  if (bEl) {
    try {
      const b = await (await fetch('data/breweries-distilleries.json', { cache: 'no-store' })).json();
      const nb = (b.breweries || []).length, nd = (b.distilleries || []).length;
      bEl.textContent = `${nb} breweries · ${nd} distilleries`;
    } catch (e) { bEl.textContent = 'Breweries & distilleries'; }
  }
}

/* ---------- Category pages: event list ---------- */

/* ---------- Happy hours & lunch specials (Food & Drink sub-category) ---------- */

const SPECIAL_RE = /happy hour|weekday lunch|lunch special|industry night|\$\d+\s*(beer|wine|pint)|half[- ]?(price|off)|1\/2 off|taco tue/i;
function isSpecial(ev) {
  return ev.category === 'food-drink' && SPECIAL_RE.test(ev.title) && !isGameNight(ev);
}

// Game nights: trivia, bingo (incl. pajama / music / vinyl bingo), Singo, bunco, mahjong, board-game nights.
const GAME_RE = /trivia|bingo|singo|bunco|mah[- ]?jon?gg?|majong|game night|board game/i;
function isGameNight(ev) {
  return GAME_RE.test(ev.title);
}

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function pacific(iso, opts) {
  return new Date(iso).toLocaleString('en-US', { timeZone: WOODINVILLE_TZ, ...opts });
}
function daysText(days) {
  const set = WEEK.filter((d) => days.has(d));
  if (set.length === 7) return 'Daily';
  if (set.length === 6) return `Daily except ${WEEK.find((d) => !days.has(d))}`;
  const out = [];
  let i = 0;
  while (i < set.length) {
    let j = i;
    while (j + 1 < set.length && WEEK.indexOf(set[j + 1]) === WEEK.indexOf(set[j]) + 1) j++;
    out.push(j - i >= 2 ? `${set[i]}–${set[j]}` : set.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return out.join(', ');
}
// One row per deal (venue + title) instead of one card per day.
function groupSpecials(list) {
  const fold2 = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const groups = new Map();
  list.forEach((ev) => {
    const vk = fold2(String(ev.location || '').split(',')[0]);
    const k = vk + '|' + fold2(ev.title);
    if (!groups.has(k)) groups.set(k, { venueKey: vk, venue: String(ev.location || '').split(',')[0].trim(), first: ev, events: [] });
    groups.get(k).events.push(ev);
  });
  return [...groups.values()].map((g) => {
    const days = new Set(g.events.map((e) => pacific(e.start, { weekday: 'short' })));
    const times = {};
    g.events.forEach((e) => {
      const t = e.timeTBA ? 'Time TBA' : pacific(e.start, { hour: 'numeric', minute: '2-digit' }) + (e.end ? ' – ' + pacific(e.end, { hour: 'numeric', minute: '2-digit' }) : '');
      times[t] = (times[t] || 0) + 1;
    });
    const time = Object.entries(times).sort((a, b) => b[1] - a[1])[0][0];
    const few = g.events.length <= 2;
    const when = few ? g.events.map((e) => pacific(e.start, { weekday: 'short', month: 'short', day: 'numeric' })).join(' · ') : daysText(days);
    return { ...g, when, time, next: pacific(g.events[0].start, { weekday: 'short', month: 'short', day: 'numeric' }) };
  }).sort((a, b) => sortKey(a.venue).localeCompare(sortKey(b.venue)) || a.first.title.localeCompare(b.first.title));
}
function specialRowHtml(g) {
  const ev = g.first;
  if (g.kind === 'static') {
    const name = g.url
      ? `<a href="${escapeAttr(g.url)}" target="_blank" rel="noopener">${escapeHtml(g.venue)}</a>`
      : escapeHtml(g.venue);
    return `
    <li class="special-row">
      <div class="sp-main">
        <h3>${name}</h3>
        <p class="sp-details">${escapeHtml(g.details || '')}</p>
      </div>
      <div class="sp-when"><strong>${escapeHtml(g.when || '')}</strong>${g.time ? `<span>${escapeHtml(g.time)}</span>` : ''}</div>
    </li>`;
  }
  const title = ev.url
    ? `<a href="${escapeAttr(ev.url)}" target="_blank" rel="noopener">${escapeHtml(ev.title)}</a>`
    : escapeHtml(ev.title);
  return `
    <li class="special-row">
      <div class="sp-main">
        <h3>${title}</h3>
        <p class="sp-venue">${escapeHtml(g.venue)}</p>
      </div>
      <div class="sp-when"><strong>${escapeHtml(g.when)}</strong><span>${escapeHtml(g.time)}</span><em>Next: ${escapeHtml(g.next)}</em></div>
    </li>`;
}

async function renderCategoryList() {
  const list = document.querySelector('.event-list');
  if (!list) return;
  const category = document.body.getAttribute('data-category');

  // Accent-insensitive, case-insensitive text (LaShellé = lashelle).
  const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const venueOf = (ev) => String(ev.location || '').split(',')[0].trim();
  const venueKey = (ev) => fold(venueOf(ev)).replace(/[^a-z0-9]+/g, '');

  try {
    const data = await loadEvents();
    setFooterUpdated(data.updatedAt);

    const events = (data.events || []).filter((ev) => (category === 'game-nights' ? isGameNight(ev) : ev.category === category && !isGameNight(ev)));

    if (!events.length) {
      list.innerHTML = `<li class="empty-state">No ${category} events found in the next 90 days. Check back soon — this list refreshes daily.</li>`;
      return;
    }

    // Same event, same place, same day, several start times (e.g. the SOMM blending classes): one card, times listed together.
    function mergeSameDay(list) {
      const out = [];
      const seen = new Map();
      list.forEach((ev) => {
        const k = [venueKey(ev), fold(ev.title).replace(/[^a-z0-9]+/g, ''), dayKey(ev.start)].join('|');
        if (seen.has(k)) seen.get(k).times.push(ev);
        else { const m = { ...ev, times: [ev] }; seen.set(k, m); out.push(m); }
      });
      return out;
    }

    const cardHtml = (ev) => {
      const { day, month, full, time } = formatDay(ev.start);
      const title = ev.url
        ? `<a href="${escapeAttr(ev.url)}" target="_blank" rel="noopener">${escapeHtml(ev.title)}</a>`
        : escapeHtml(ev.title);
      // Keep each listing simple: title (artist/event + venue), then time and
      // a short venue name only when the title doesn't already name it.
      const venue = venueOf(ev);
      const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const venueInTitle = venue && venue.split('&').some((part) => {
        const k = norm(part).split(' ').slice(0, 2).join(' ');
        return k && norm(ev.title).includes(k);
      });
      const endTime = ev.end ? new Date(ev.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: WOODINVILLE_TZ }) : '';
      const when = ev.times && ev.times.length > 1
        ? ev.times.map((t) => fmtTime(t.start)).join(', ')
        : (ev.timeTBA ? (endTime ? 'Until ' + endTime : 'Time TBA') : time + (endTime ? ' – ' + endTime : ''));
      const meta = [full + ' · ' + when, venue && !venueInTitle ? venue : ''].filter(Boolean).join(' — ');
      return `
        <li class="event-card">
          <div class="event-date">
            <div class="day">${day}</div>
            <div class="month">${month}</div>
          </div>
          <div class="event-body">
            <h3>${title}</h3>
            <p class="event-meta">${escapeHtml(meta)}</p>
          </div>
        </li>`;
    };

    // ---- Happy hours & specials sub-category (Food & Drink only) ----
    const hasSub = category === 'food-drink';
    const eventsOnly = mergeSameDay(hasSub ? events.filter((ev) => !isSpecial(ev)) : events);
    const specials = hasSub ? events.filter(isSpecial) : [];
    let hh = { rows: [], also: null };
    let dining = { rows: [] };
    if (hasSub) {
      try { hh = await (await fetch('data/happy-hours.json', { cache: 'no-store' })).json(); } catch (e) { /* curated list unavailable */ }
      try { dining = await (await fetch('data/winery-dining.json', { cache: 'no-store' })).json(); } catch (e) { /* curated list unavailable */ }
    }
    const keyOf = (t) => fold(t).replace(/[^a-z0-9]+/g, '');
    // One row per venue: curated schedule first, plus any other recurring deal the calendars carry.
    const curated = (hh.rows || []).map((r) => ({ kind: 'static', ...r, venueKey: keyOf(r.venue), first: {} }));
    const generated = groupSpecials(specials).filter((g) => !curated.some((r) => (r.match || []).some((m) => g.venueKey.includes(m))));
    const specialRows = [...curated, ...generated].sort((a, b) => sortKey(a.venue).localeCompare(sortKey(b.venue)) || String(a.first.title || '').localeCompare(String(b.first.title || '')));
    const diningRows = (dining.rows || []).map((r) => ({ kind: 'static', ...r, venueKey: keyOf(r.venue), first: {} }))
      .sort((a, b) => sortKey(a.venue).localeCompare(sortKey(b.venue)));
    const rowsFor = (v) => (v === 'dining' ? diningRows : specialRows);
    let view = 'events';

    // ---- Search: artist / event name and winery ----
    const bar = document.createElement('div');
    bar.className = 'event-search';
    bar.innerHTML = `
      ${hasSub ? `<div class="subtabs" role="tablist">
        <button type="button" class="subtab on" data-view="events" role="tab">Events <small>${eventsOnly.length}</small></button>
        <button type="button" class="subtab" data-view="specials" role="tab">Happy hours &amp; specials <small>${specialRows.length}</small></button>
        <button type="button" class="subtab" data-view="dining" role="tab">Winery dining <small>${diningRows.length}</small></button>
      </div>` : ''}
      <label class="es-field"><span>Search artist, event or deal</span>
        <input type="search" id="ev-q" placeholder="e.g. Brian James" autocomplete="off"></label>
      <label class="es-field"><span>Winery or venue</span>
        <select id="ev-venue"></select></label>
      <p class="es-count" id="ev-count" aria-live="polite"></p>`;
    list.parentNode.insertBefore(bar, list);

    const qEl = bar.querySelector('#ev-q');
    const vEl = bar.querySelector('#ev-venue');
    const cEl = bar.querySelector('#ev-count');

    const fillVenues = () => {
      const venues = new Map();
      if (view !== 'events') rowsFor(view).forEach((r) => { if (r.venueKey && !venues.has(r.venueKey)) venues.set(r.venueKey, r.venue); });
      else eventsOnly.forEach((ev) => { const k = venueKey(ev); if (k && !venues.has(k)) venues.set(k, venueOf(ev)); });
      const opts = [...venues.entries()].sort((a, b) => sortKey(a[1]).localeCompare(sortKey(b[1])))
        .map(([k, label]) => `<option value="${escapeAttr(k)}">${escapeHtml(label)}</option>`).join('');
      vEl.innerHTML = `<option value="">All wineries &amp; venues</option>${opts}`;
    };

    const apply = () => {
      const tokens = fold(qEl.value).split(/\s+/).filter(Boolean);
      const vk = vEl.value;
      const filtered = tokens.length || vk;
      if (view === 'specials' || view === 'dining') {
        const rows = rowsFor(view).filter((r) => {
          if (vk && r.venueKey !== vk) return false;
          if (!tokens.length) return true;
          const hay = fold(`${r.venue} ${r.details || ''} ${r.when || ''} ${r.first.title || ''}`);
          return tokens.every((t) => hay.includes(t));
        });
        const also = view === 'specials' && !filtered && hh.also
          ? `<li class="special-note">${escapeHtml((hh.also.venues || []).join(', '))} ${escapeHtml(hh.also.text || '')} <a href="${escapeAttr(hh.also.url)}" target="_blank" rel="noopener">Current list on Yelp →</a></li>`
          : '';
        list.innerHTML = rows.length ? rows.map(specialRowHtml).join('') + also : '<li class="empty-state">No matches.</li>';
        cEl.textContent = view === 'dining'
          ? `${rows.length} ${rows.length === 1 ? 'place' : 'places'} serving food, delivering, or doing something special for dinner`
          : `${rows.length} ${rows.length === 1 ? 'place' : 'places'} with recurring happy hours or specials`;
      } else {
        const shown = eventsOnly.filter((ev) => {
          if (vk && venueKey(ev) !== vk) return false;
          if (!tokens.length) return true;
          const hay = fold(`${ev.title} ${ev.location || ''} ${ev.description || ''}`);
          return tokens.every((t) => hay.includes(t));
        });
        list.innerHTML = shown.length
          ? shown.map(cardHtml).join('')
          : '<li class="empty-state">No matches. Try just the artist\'s last name, or choose "All wineries &amp; venues".</li>';
        cEl.textContent = filtered ? `${shown.length} of ${eventsOnly.length} events` : `${eventsOnly.length} upcoming events`;
      }
    };

    bar.querySelectorAll('.subtab').forEach((btn) => btn.addEventListener('click', () => {
      view = btn.dataset.view;
      bar.querySelectorAll('.subtab').forEach((b) => b.classList.toggle('on', b === btn));
      list.classList.toggle('specials-list', view !== 'events');
      qEl.value = '';
      fillVenues();
      apply();
    }));
    qEl.addEventListener('input', apply);
    vEl.addEventListener('change', apply);
    fillVenues();
    apply();
  } catch (err) {
    list.innerHTML = `<li class="error-state">Couldn't load events right now. Try refreshing the page.</li>`;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

/* ---------- Winery directory ---------- */

async function renderWineries() {
  const root = document.querySelector('.winery-directory');
  const filterBar = document.querySelector('.type-filter-bar:not(.wine-color-bar)');
  const colorBar = document.querySelector('.wine-color-bar');
  if (!root) return;
  try {
    const res = await fetch('data/wineries.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load wineries (${res.status})`);
    const data = await res.json();
    const labels = data.type_labels || {};
    const HIDDEN_TYPES = new Set(['casual', 'romantic']); // no Casual & Local / Romantic & Intimate sorting here

    if (colorBar) {
      const colors = [['all', 'All'], ['beer', 'Beer'], ['red', 'Red'], ['bubbles', 'Sparkling'], ['white', 'White']];
      colorBar.innerHTML = colors.map(([key, label]) =>
        `<button type="button" class="type-chip${key === 'all' ? ' active' : ''}" data-color="${escapeAttr(key)}">${escapeHtml(label)}</button>`
      ).join('');
    }

    if (filterBar) {
      const allTypes = Object.keys(labels).filter((t) => !HIDDEN_TYPES.has(t)).sort((a, b) => String(labels[a]).localeCompare(String(labels[b])));
      filterBar.innerHTML = ['all', ...allTypes].map((t) => {
        const label = t === 'all' ? 'All wineries' : labels[t];
        return `<button type="button" class="type-chip${t === 'all' ? ' active' : ''}" data-type="${escapeAttr(t)}">${escapeHtml(label)}</button>`;
      }).join('');
    }

    root.innerHTML = [...(data.districts || [])].filter((d) => (d.wineries || []).length).sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name))).map((district) => {
      const chips = [...district.wineries].sort(byName).map((w) => {
        const name = escapeHtml(w.name);
        const note = w.note ? `<span class="note">${escapeHtml(w.note)}</span>` : '';
        const types = w.types || [];
        const tagText = types.filter((t) => !HIDDEN_TYPES.has(t)).map((t) => labels[t] || t).join(' · ');
        const tags = tagText ? `<span class="tags">${escapeHtml(tagText)}</span>` : '';
        const colors = w.wineFocus || [];
        const visit = w.url ? '<span class="visit">Website →</span>' : '';
        const inner = `${name}${note}${tags}${visit}`;
        const tag = w.url ? 'a' : 'div';
        const hrefAttrs = w.url ? `href="${escapeAttr(w.url)}" target="_blank" rel="noopener"` : '';
        return `<${tag} class="winery-chip" ${hrefAttrs} data-types="${escapeAttr(types.join(','))}" data-colors="${escapeAttr(colors.join(','))}" style="--dist-accent: var(--${district.accent})">${inner}</${tag}>`;
      }).join('');
      return `
        <section class="winery-district" id="${escapeAttr(district.id)}">
          <h2 style="--dist-accent: var(--${district.accent})">${escapeHtml(district.name)}</h2>
          <div class="winery-grid">${chips}</div>
        </section>`;
    }).join('');

    let activeType = 'all';
    let activeColor = 'all';

    function applyFilters() {
      document.querySelectorAll('.winery-chip').forEach((chip) => {
        const types = (chip.getAttribute('data-types') || '').split(',');
        const colors = (chip.getAttribute('data-colors') || '').split(',').filter(Boolean);
        const typeOk = activeType === 'all' || types.includes(activeType);
        // A winery with no confirmed color focus is never excluded by color —
        // we just don't know, rather than assuming it doesn't pour that color.
        // Once a specific pour is picked, only show wineries actually confirmed to
        // pour it — an untagged winery no longer auto-shows, or every color would
        // look like nearly the same list.
        const colorOk = activeColor === 'all' || colors.includes(activeColor);
        chip.classList.toggle('hidden', !(typeOk && colorOk));
      });
      document.querySelectorAll('.winery-district').forEach((section) => {
        const visible = section.querySelectorAll('.winery-chip:not(.hidden)').length;
        section.style.display = visible ? '' : 'none';
      });
    }

    if (filterBar) {
      filterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.type-chip');
        if (!btn) return;
        filterBar.querySelectorAll('.type-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeType = btn.getAttribute('data-type');
        applyFilters();
      });
    }

    if (colorBar) {
      colorBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.type-chip');
        if (!btn) return;
        colorBar.querySelectorAll('.type-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeColor = btn.getAttribute('data-color');
        applyFilters();
      });
    }
  } catch (err) {
    root.innerHTML = `<p class="error-state">Couldn't load the winery directory right now. Try refreshing the page.</p>`;
  }
}

/* ---------- Day planner ---------- */

const INTEREST_META = {
  'live-music': { label: 'Live Music', icon: '🎵', accent: 'var(--music)', bg: 'var(--music-bg)' },
  'family': { label: 'Family & Dog-Friendly', icon: '🐾', accent: 'var(--art)', bg: 'var(--art-bg)' },
  'romantic': { label: 'Romantic & Intimate', icon: '💜', accent: 'var(--community)', bg: 'var(--community-bg)' },
  'estate': { label: 'Estate & Tours', icon: '🏰', accent: 'var(--wine-deep)', bg: 'var(--wine-bg)' },
  'food-pairing': { label: 'Food Pairing', icon: '🍽️', accent: 'var(--food)', bg: 'var(--food-bg)' },
  'casual': { label: 'Casual & Local', icon: '🍇', accent: 'var(--comedy-deep)', bg: 'var(--comedy-bg)' },
};

// 'YYYY-MM-DD' for a moment in time, as a calendar day in Woodinville.
function dayKey(input) {
  return new Date(input).toLocaleDateString('en-CA', { timeZone: WOODINVILLE_TZ });
}
function fmtTime(input) {
  return new Date(input).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: WOODINVILLE_TZ });
}
function hourOf(input) {
  return parseInt(new Date(input).toLocaleTimeString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: WOODINVILLE_TZ }), 10);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function renderPlanner() {
  const grid = document.getElementById('interest-grid');
  const form = document.getElementById('planner-form');
  if (!grid || !form) return;

  grid.innerHTML = Object.entries(INTEREST_META).sort((a, b) => a[1].label.localeCompare(b[1].label)).map(([key, m]) => `
    <label class="interest-pill" style="--pill-accent: ${m.accent}; --pill-bg: ${m.bg}">
      <input type="checkbox" value="${key}" name="interest">
      <span>${m.label}</span>
    </label>
  `).join('');

  let wineriesData = null;
  let restaurantsData = null;
  let eventsData = null;
  try {
    const [wRes, rRes, eRes] = await Promise.all([
      fetch('data/wineries.json', { cache: 'no-store' }),
      fetch('data/restaurants.json', { cache: 'no-store' }),
      fetch('data/events.json', { cache: 'no-store' }),
    ]);
    wineriesData = await wRes.json();
    restaurantsData = await rRes.json();
    eventsData = await eRes.json();
  } catch (err) {
    document.getElementById('itinerary').innerHTML = `<p class="error-state">Couldn't load planner data right now. Try refreshing the page.</p>`;
    return;
  }

  // Date picker: today (Woodinville time) through the end of the event window.
  const dateInput = document.getElementById('plan-date');
  const todayKey = dayKey(Date.now());
  const maxKey = dayKey(Date.now() + 1000 * 60 * 60 * 24 * ((eventsData && eventsData.windowDays) || 90));
  dateInput.min = todayKey;
  dateInput.max = maxKey;
  const wanted = new URLSearchParams(window.location.search).get('date');
  dateInput.value = wanted && wanted >= todayKey && wanted <= maxKey ? wanted : todayKey;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const interests = Array.from(form.querySelectorAll('input[name="interest"]:checked')).map((el) => el.value);
    const pace = parseInt(document.getElementById('pace').value, 10);
    const district = document.getElementById('district').value;
    const wineColor = document.getElementById('wine-color').value;
    const date = dateInput.value || todayKey;
    buildItinerary({ interests, pace, district, wineColor, date, wineriesData, restaurantsData, eventsData });
  });
}

function buildItinerary({ interests, pace, district, wineColor, date, wineriesData, restaurantsData, eventsData }) {
  const out = document.getElementById('itinerary');
  const allEvents = eventsData.events || [];

  const STOPWORDS = new Set(['the', 'estate', 'winery', 'wineries', 'cellars', 'cellar', 'wines', 'wine',
    'vintners', 'tasting', 'studio', 'room', 'bar', 'vineyards', 'vineyard', 'co', 'company', 'woodinville']);

  function coreWords(name) {
    return name.toLowerCase().replace(/[.,'’]/g, '').split(/\s+/)
      .filter((w) => w && w.length > 1 && !STOPWORDS.has(w));
  }

  // Only events on the chosen calendar day (Woodinville time). If the chosen
  // day is today, skip events that have already started.
  const dayEvents = allEvents
    .filter((ev) => dayKey(ev.start) === date && new Date(ev.start).getTime() >= Date.now() - 1000 * 60 * 60 * 2)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  // Match on the venue-name part of the location (text before the first
  // comma), whole words only — matching anywhere in the address attached an
  // Obelisco event ("Apple Farm Village Tasting Room") to Village Wines.
  function eventsForVenue(name) {
    const words = coreWords(name);
    if (!words.length) return [];
    return dayEvents.filter((ev) => {
      const first = (ev.location || '').split(',')[0].toLowerCase().replace(/[.'’]/g, '').split(/\s+/);
      return words.some((w) => first.includes(w));
    });
  }

  let wineries = [];
  (wineriesData.districts || []).forEach((d) => {
    if (district !== 'any' && d.id !== district) return;
    d.wineries.forEach((w) => wineries.push({ ...w, districtName: d.name, districtId: d.id }));
  });

  const wantsLiveMusic = interests.includes('live-music');

  const scored = wineries.map((w) => {
    const types = w.types || [];
    let overlap = interests.length ? types.filter((t) => interests.includes(t)).length : 0;
    if (wineColor !== 'any' && (w.wineFocus || []).includes(wineColor)) overlap += 2;
    let upcoming = eventsForVenue(w.name);
    if (wantsLiveMusic) upcoming = [...upcoming.filter((e) => e.category === 'music'), ...upcoming.filter((e) => e.category !== 'music')];
    // Strongly prefer venues with a real event on the chosen date — especially
    // when the person actually asked for live music — so the plan names a real
    // artist and time instead of just describing the venue.
    if (upcoming.length) overlap += wantsLiveMusic && upcoming[0].category === 'music' ? 4 : 1;
    return { ...w, overlap, upcomingEvents: upcoming };
  });

  const withMatch = scored.filter((w) => w.overlap > 0);
  const pool = interests.length && withMatch.length ? withMatch : scored;
  pool.sort((a, b) => b.overlap - a.overlap);

  // Greedy pick: never two stops for the same venue (e.g. Obelisco has two
  // tasting rooms) and never the same event attached to two stops.
  const baseName = (n) => n.toLowerCase().replace(/\(.*?\)/g, '').trim();
  const picked = [];
  const usedBase = new Set();
  const usedEvents = new Set();
  const want = Math.max(1, pace - 1);
  // Best matches first: shuffle only within each score tier, so a short list of
  // top matches (e.g. the few wineries with music that day) is never diluted by
  // shuffling the whole pool.
  const tiers = new Map();
  pool.forEach((w) => tiers.set(w.overlap, [...(tiers.get(w.overlap) || []), w]));
  const ranked = [...tiers.keys()].sort((a, b) => b - a).flatMap((k) => shuffle(tiers.get(k)));
  for (const w of ranked) {
    if (picked.length >= want) break;
    const ev = (w.upcomingEvents || [])[0];
    if (usedBase.has(baseName(w.name)) || (ev && usedEvents.has(ev))) continue;
    picked.push(w);
    usedBase.add(baseName(w.name));
    if (ev) usedEvents.add(ev);
  }
  // Stops without a scheduled event come first; stops with one follow in time order.
  const chosenWineries = [
    ...picked.filter((w) => !(w.upcomingEvents || []).length),
    ...picked.filter((w) => (w.upcomingEvents || []).length)
      .sort((a, b) => new Date(a.upcomingEvents[0].start) - new Date(b.upcomingEvents[0].start)),
  ];

  const restaurantVibeFromInterests = interests.length ? interests : ['casual'];
  const scoredRestaurants = (restaurantsData.restaurants || []).map((r) => {
    const overlap = r.vibe.filter((v) => restaurantVibeFromInterests.includes(v)).length;
    return { ...r, overlap };
  });
  scoredRestaurants.sort((a, b) => b.overlap - a.overlap);
  const topRestaurants = shuffle(scoredRestaurants.filter((r) => r.overlap === scoredRestaurants[0]?.overlap));
  const lunchSpot = topRestaurants[0];
  const dinnerSpot = topRestaurants.find((r) => r.name !== lunchSpot?.name) || topRestaurants[0];

  const stopIcon = { 'live-music': '🎵', family: '🐾', romantic: '💜', estate: '🏰', 'food-pairing': '🍽️', casual: '🍇' };
  const accentFor = (types) => {
    const t = (types || [])[0];
    return INTEREST_META[t]?.accent || 'var(--wine-deep)';
  };

  const eventLine = (w) => {
    const ev = (w.upcomingEvents || [])[0];
    if (!ev) return '';
    return `<p class="event-line"><span class="event-tag">${ev.category === 'music' ? 'Live music' : 'Event'}</span>${escapeHtml(ev.title)} — ${escapeHtml(fmtTime(ev.start))}${ev.url ? ` <a href="${escapeAttr(ev.url)}" target="_blank" rel="noopener">Details →</a>` : ''}</p>`;
  };

  const wineryCard = (w, timeLabel) => `
    <div class="stop-card" style="--stop-accent: ${accentFor(w.types)}">
      <div class="stop-icon">${stopIcon[(w.types || [])[0]] || '🍷'}</div>
      <div>
        <h4>${timeLabel}: ${escapeHtml(w.name)}</h4>
        <p>${escapeHtml(w.districtName)}${w.types && w.types.length ? ' — ' + w.types.map((t) => INTEREST_META[t]?.label || t).join(', ') : ''}${w.wineFocus && w.wineFocus.length ? ' · ' + w.wineFocus.map((v) => v === 'bubbles' ? 'Bubbles' : v[0].toUpperCase() + v.slice(1)).join(', ') : ''}</p>
        ${eventLine(w)}
        ${w.url ? `<a href="${escapeAttr(w.url)}" target="_blank" rel="noopener">Visit website →</a>` : ''}
      </div>
    </div>`;

  const restaurantCard = (r, timeLabel) => r ? `
    <div class="stop-card" style="--stop-accent: var(--food)">
      <div class="stop-icon">🍽️</div>
      <div>
        <h4>${timeLabel}: ${escapeHtml(r.name)}</h4>
        <p>${escapeHtml(r.note)}</p>
        ${r.url ? `<a href="${escapeAttr(r.url)}" target="_blank" rel="noopener">Visit website →</a>` : ''}
      </div>
    </div>` : '';

  const timeLabels = ['Morning', 'Midday', 'Afternoon', 'Evening'];
  const prettyDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  // Heading for a winery stop: follows the event's start time when it has one.
  const slotFor = (w, fallback) => {
    const ev = (w.upcomingEvents || [])[0];
    if (!ev) return fallback;
    const h = hourOf(ev.start);
    return h < 12 ? 'Morning' : h < 16 ? 'Afternoon' : 'Evening';
  };
  let html = `<h2 class="itinerary-date">Your plan for ${escapeHtml(prettyDate)}</h2>`;

  if (wantsLiveMusic && chosenWineries.every((w) => !(w.upcomingEvents || []).length)) {
    html += `<p class="error-state" style="margin-bottom:20px;">No confirmed live music on ${escapeHtml(prettyDate)} at wineries matching your other picks — showing the best match anyway. Try a different date, "Any district", or fewer filters, or check the <a href="music.html">Music page</a>.</p>`;
  }

  html += `<div class="itinerary-block"><h3>${chosenWineries[0] ? slotFor(chosenWineries[0], timeLabels[0]) : timeLabels[0]} tasting</h3>${chosenWineries[0] ? wineryCard(chosenWineries[0], 'Start here') : ''}</div>`;
  html += `<div class="itinerary-block"><h3>${timeLabels[1]} bite</h3>${restaurantCard(lunchSpot, 'Lunch')}</div>`;
  if (chosenWineries[1]) {
    html += `<div class="itinerary-block"><h3>${slotFor(chosenWineries[1], timeLabels[2])} tasting</h3>${wineryCard(chosenWineries[1], 'Next stop')}</div>`;
  }
  if (pace >= 4 && chosenWineries[2]) {
    html += `<div class="itinerary-block"><h3>One more stop</h3>${wineryCard(chosenWineries[2], 'Last tasting')}</div>`;
  }
  html += `<div class="itinerary-block"><h3>${timeLabels[timeLabels.length - 1]}</h3>${restaurantCard(dinnerSpot, 'Dinner')}</div>`;

  // Everything else on the calendar for that day that isn't already a stop.
  const used = new Set(chosenWineries.map((w) => (w.upcomingEvents || [])[0]).filter(Boolean));
  const others = dayEvents.filter((ev) => !used.has(ev)).slice(0, 10);
  if (others.length) {
    html += `<div class="also-happening"><h3>Also happening ${escapeHtml(prettyDate)}</h3><ul>${others.map((ev) => `
      <li><strong>${escapeHtml(ev.title)}</strong> — ${escapeHtml(fmtTime(ev.start))}${ev.url ? ` <a href="${escapeAttr(ev.url)}" target="_blank" rel="noopener">Details →</a>` : ''}
      <small>${escapeHtml((ev.location || '').split(',')[0])}</small></li>`).join('')}</ul></div>`;
  } else if (!dayEvents.length) {
    html += `<p class="error-state" style="margin-top:20px;">No listed events for ${escapeHtml(prettyDate)} yet — the plan above is built from our winery and restaurant directory.</p>`;
  }

  out.innerHTML = html;
  if (typeof out.scrollIntoView === 'function') {
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ---------- Breweries & distilleries ---------- */

async function renderBreweries() {
  const root = document.querySelector('.brewery-directory');
  if (!root) return;
  try {
    const res = await fetch('data/breweries-distilleries.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load (${res.status})`);
    const data = await res.json();
    const section = (title, id, accent, items) => {
      const rows = [...items].sort(byName).map((b) => {
        const tag = b.url ? 'a' : 'div';
        const href = b.url ? `href="${escapeAttr(b.url)}" target="_blank" rel="noopener"` : '';
        return `<${tag} class="winery-chip" ${href}>${escapeHtml(b.name)}
          <span class="note">${escapeHtml([b.address, b.area].filter(Boolean).join(' · '))}</span>
          ${b.note ? `<span class="note">${escapeHtml(b.note)}</span>` : ''}
          ${b.url ? '<span class="visit">Website →</span>' : ''}</${tag}>`;
      }).join('');
      return `<section class="winery-district" id="${id}"><h2 style="--dist-accent: ${accent}">${title}</h2><div class="winery-grid">${rows}</div></section>`;
    };
    root.innerHTML = section('Breweries', 'breweries', 'var(--wine-deep)', data.breweries || [])
      + section('Distilleries', 'distilleries', 'var(--food)', data.distilleries || []);
  } catch (err) {
    root.innerHTML = `<p class="error-state">Couldn't load the brewery list right now. Try refreshing the page.</p>`;
  }
}

renderHomeCounts();
renderCategoryList();
renderBreweries();
renderWineries();
renderPlanner();
