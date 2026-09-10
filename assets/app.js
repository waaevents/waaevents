// Woodinville Creative Events — front-end rendering
// Reads /data/events.json (regenerated daily by scripts/update-events.mjs)

const DATA_URL = 'data/events.json';

async function loadEvents() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
  return res.json();
}

function formatDay(dateStr) {
  const d = new Date(dateStr);
  return {
    day: d.toLocaleDateString('en-US', { day: 'numeric' }),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
    full: d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function formatUpdated(iso) {
  if (!iso) return 'not yet run';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function setFooterUpdated(iso) {
  document.querySelectorAll('[data-updated]').forEach((el) => {
    el.textContent = formatUpdated(iso);
  });
}

/* ---------- Homepage: panel counts ---------- */

async function renderHomeCounts() {
  const els = document.querySelectorAll('[data-count-for]');
  if (!els.length) return;
  try {
    const data = await loadEvents();
    const counts = { art: 0, music: 0, comedy: 0, 'food-drink': 0, community: 0 };
    for (const ev of data.events || []) {
      if (counts[ev.category] !== undefined) counts[ev.category] += 1;
    }
    els.forEach((el) => {
      const cat = el.getAttribute('data-count-for');
      const n = counts[cat] || 0;
      el.textContent = n === 1 ? '1 upcoming event' : `${n} upcoming events`;
    });
    setFooterUpdated(data.updatedAt);
  } catch (err) {
    els.forEach((el) => { el.textContent = 'Event count unavailable'; });
  }
}

/* ---------- Category pages: event list ---------- */

async function renderCategoryList() {
  const list = document.querySelector('.event-list');
  if (!list) return;
  const category = document.body.getAttribute('data-category');

  try {
    const data = await loadEvents();
    setFooterUpdated(data.updatedAt);

    const events = (data.events || []).filter((ev) => ev.category === category);

    if (!events.length) {
      list.innerHTML = `<li class="empty-state">No ${category} events found in the next 90 days. Check back soon — this list refreshes daily.</li>`;
      return;
    }

    list.innerHTML = events.map((ev) => {
      const { day, month, full, time } = formatDay(ev.start);
      const title = ev.url
        ? `<a href="${escapeAttr(ev.url)}" target="_blank" rel="noopener">${escapeHtml(ev.title)}</a>`
        : escapeHtml(ev.title);
      const meta = [full + ' · ' + time, ev.location].filter(Boolean).join(' — ');
      const desc = ev.description
        ? `<p class="event-desc">${escapeHtml(ev.description)}</p>`
        : '';
      return `
        <li class="event-card">
          <div class="event-date">
            <div class="day">${day}</div>
            <div class="month">${month}</div>
          </div>
          <div class="event-body">
            <h3>${title}</h3>
            <p class="event-meta">${escapeHtml(meta)}</p>
            ${desc}
          </div>
        </li>`;
    }).join('');
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
  const filterBar = document.querySelector('.type-filter-bar');
  if (!root) return;
  try {
    const res = await fetch('data/wineries.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load wineries (${res.status})`);
    const data = await res.json();
    const labels = data.type_labels || {};

    if (filterBar) {
      const allTypes = Object.keys(labels);
      filterBar.innerHTML = ['all', ...allTypes].map((t) => {
        const label = t === 'all' ? 'All wineries' : labels[t];
        return `<button type="button" class="type-chip${t === 'all' ? ' active' : ''}" data-type="${escapeAttr(t)}">${escapeHtml(label)}</button>`;
      }).join('');
    }

    root.innerHTML = (data.districts || []).map((district) => {
      const chips = district.wineries.map((w) => {
        const label = w.url
          ? `<a href="${escapeAttr(w.url)}" target="_blank" rel="noopener">${escapeHtml(w.name)}</a>`
          : escapeHtml(w.name);
        const note = w.note ? `<span class="note">${escapeHtml(w.note)}</span>` : '';
        const types = w.types || [];
        const tagText = types.map((t) => labels[t] || t).join(' · ');
        const tags = tagText ? `<span class="tags">${escapeHtml(tagText)}</span>` : '';
        return `<div class="winery-chip" data-types="${escapeAttr(types.join(','))}" style="--dist-accent: var(--${district.accent})">${label}${note}${tags}</div>`;
      }).join('');
      return `
        <section class="winery-district" id="${escapeAttr(district.id)}">
          <h2 style="--dist-accent: var(--${district.accent})">${escapeHtml(district.name)}</h2>
          <div class="winery-grid">${chips}</div>
        </section>`;
    }).join('');

    if (filterBar) {
      filterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.type-chip');
        if (!btn) return;
        filterBar.querySelectorAll('.type-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const type = btn.getAttribute('data-type');
        document.querySelectorAll('.winery-chip').forEach((chip) => {
          const types = (chip.getAttribute('data-types') || '').split(',');
          const show = type === 'all' || types.includes(type);
          chip.classList.toggle('hidden', !show);
        });
        document.querySelectorAll('.winery-district').forEach((section) => {
          const visible = section.querySelectorAll('.winery-chip:not(.hidden)').length;
          section.style.display = visible ? '' : 'none';
        });
      });
    }
  } catch (err) {
    root.innerHTML = `<p class="error-state">Couldn't load the winery directory right now. Try refreshing the page.</p>`;
  }
}

renderHomeCounts();
renderCategoryList();
renderWineries();
renderPlanner();

/* ---------- Day planner ---------- */

const INTEREST_META = {
  'live-music': { label: 'Live Music', icon: '🎵', accent: 'var(--music)', bg: 'var(--music-bg)' },
  'family': { label: 'Family & Dog-Friendly', icon: '🐾', accent: 'var(--art)', bg: 'var(--art-bg)' },
  'romantic': { label: 'Romantic & Intimate', icon: '💜', accent: 'var(--community)', bg: 'var(--community-bg)' },
  'estate': { label: 'Estate & Tours', icon: '🏰', accent: 'var(--wine-deep)', bg: 'var(--wine-bg)' },
  'food-pairing': { label: 'Food Pairing', icon: '🍽️', accent: 'var(--food)', bg: 'var(--food-bg)' },
  'casual': { label: 'Casual & Local', icon: '🍇', accent: 'var(--comedy-deep)', bg: 'var(--comedy-bg)' },
};

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

  grid.innerHTML = Object.entries(INTEREST_META).map(([key, m]) => `
    <label class="interest-pill" style="--pill-accent: ${m.accent}; --pill-bg: ${m.bg}">
      <input type="checkbox" value="${key}" name="interest">
      <span>${m.icon} ${m.label}</span>
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

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const interests = Array.from(form.querySelectorAll('input[name="interest"]:checked')).map((el) => el.value);
    const pace = parseInt(document.getElementById('pace').value, 10);
    const district = document.getElementById('district').value;
    buildItinerary({ interests, pace, district, wineriesData, restaurantsData, eventsData });
  });
}

function buildItinerary({ interests, pace, district, wineriesData, restaurantsData, eventsData }) {
  const out = document.getElementById('itinerary');

  let wineries = [];
  (wineriesData.districts || []).forEach((d) => {
    if (district !== 'any' && d.id !== district) return;
    d.wineries.forEach((w) => wineries.push({ ...w, districtName: d.name, districtId: d.id }));
  });

  const scored = wineries.map((w) => {
    const types = w.types || [];
    const overlap = interests.length ? types.filter((t) => interests.includes(t)).length : 0;
    return { ...w, overlap };
  });

  const withMatch = scored.filter((w) => w.overlap > 0);
  const pool = interests.length && withMatch.length ? withMatch : scored;
  pool.sort((a, b) => b.overlap - a.overlap);

  const topMatches = pool.filter((w) => w.overlap === pool[0]?.overlap);
  const chosenWineries = shuffle(topMatches.length >= pace ? topMatches : pool).slice(0, Math.max(1, pace - 1));

  const restaurantVibeFromInterests = interests.length ? interests : ['casual'];
  const scoredRestaurants = (restaurantsData.restaurants || []).map((r) => {
    const overlap = r.vibe.filter((v) => restaurantVibeFromInterests.includes(v)).length;
    return { ...r, overlap };
  });
  scoredRestaurants.sort((a, b) => b.overlap - a.overlap);
  const topRestaurants = shuffle(scoredRestaurants.filter((r) => r.overlap === scoredRestaurants[0]?.overlap));
  const lunchSpot = topRestaurants[0];
  const dinnerSpot = topRestaurants.find((r) => r.name !== lunchSpot?.name) || topRestaurants[0];

  const now = Date.now();
  const soon = now + 1000 * 60 * 60 * 24 * 21;
  const wineryNames = chosenWineries.map((w) => w.name.toLowerCase());
  const matchingEvent = (eventsData.events || [])
    .filter((ev) => {
      const t = new Date(ev.start).getTime();
      if (t < now || t > soon) return false;
      const loc = (ev.location || '').toLowerCase();
      return wineryNames.some((n) => loc.includes(n.split(' ')[0].toLowerCase()));
    })
    .sort((a, b) => new Date(a.start) - new Date(b.start))[0];

  const stopIcon = { 'live-music': '🎵', family: '🐾', romantic: '💜', estate: '🏰', 'food-pairing': '🍽️', casual: '🍇' };
  const accentFor = (types) => {
    const t = (types || [])[0];
    return INTEREST_META[t]?.accent || 'var(--wine-deep)';
  };

  const wineryCard = (w, timeLabel) => `
    <div class="stop-card" style="--stop-accent: ${accentFor(w.types)}">
      <div class="stop-icon">${stopIcon[(w.types || [])[0]] || '🍷'}</div>
      <div>
        <h4>${timeLabel}: ${escapeHtml(w.name)}</h4>
        <p>${escapeHtml(w.districtName)}${w.types && w.types.length ? ' — ' + w.types.map((t) => INTEREST_META[t]?.label || t).join(', ') : ''}</p>
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

  const eventCard = matchingEvent ? `
    <div class="stop-card" style="--stop-accent: var(--music)">
      <div class="stop-icon">🎉</div>
      <div>
        <h4>While you're there: ${escapeHtml(matchingEvent.title)}</h4>
        <p>${escapeHtml(new Date(matchingEvent.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))} — ${escapeHtml(matchingEvent.location || '')}</p>
        ${matchingEvent.url ? `<a href="${escapeAttr(matchingEvent.url)}" target="_blank" rel="noopener">Details →</a>` : ''}
      </div>
    </div>` : '';

  const timeLabels = ['Morning', 'Midday', 'Afternoon', 'Evening'];
  let html = '';
  let stopIdx = 0;

  html += `<div class="itinerary-block"><h3>${timeLabels[stopIdx++]} tasting</h3>${chosenWineries[0] ? wineryCard(chosenWineries[0], 'Start here') : ''}${eventCard}</div>`;
  html += `<div class="itinerary-block"><h3>${timeLabels[stopIdx++]} bite</h3>${restaurantCard(lunchSpot, 'Lunch')}</div>`;
  if (chosenWineries[1]) {
    html += `<div class="itinerary-block"><h3>${timeLabels[stopIdx++]} tasting</h3>${wineryCard(chosenWineries[1], 'Next stop')}</div>`;
  }
  if (pace >= 4 && chosenWineries[2]) {
    html += `<div class="itinerary-block"><h3>One more stop</h3>${wineryCard(chosenWineries[2], 'Last tasting')}</div>`;
  }
  html += `<div class="itinerary-block"><h3>${timeLabels[timeLabels.length - 1]}</h3>${restaurantCard(dinnerSpot, 'Dinner')}</div>`;

  out.innerHTML = html;
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
