// Woodinville Creative Events — front-end rendering
// Reads /data/events.json (regenerated daily by scripts/update-events.mjs)

const DATA_URL = '/data/events.json';

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
    const counts = { art: 0, music: 0, comedy: 0, 'food-drink': 0 };
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

renderHomeCounts();
renderCategoryList();
