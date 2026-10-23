// Expands weekly recurring shows (data/recurring-events.json) into dated events
// for the next windowDays, using Woodinville (Pacific) wall-clock times so DST
// is handled correctly. Weekday numbers: 0 = Sunday ... 6 = Saturday.

const TZ = 'America/Los_Angeles';

// Pacific wall-clock (y, m 1-12, d, hh, mm) -> UTC Date.
function pacificToUtc(y, m, d, hh, mm) {
  let t = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(t)).reduce((o, p) => (p.type !== 'literal' ? { ...o, [p.type]: Number(p.value) } : o), {});
    const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const diff = Date.UTC(y, m - 1, d, hh, mm) - shown;
    if (diff === 0) break;
    t += diff;
  }
  return new Date(t);
}

export function expandRecurring(series, now = new Date(), windowDays = 90) {
  const out = [];
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  for (let i = 0; i <= windowDays; i++) {
    const probe = new Date(now.getTime() + i * 86400000);
    const p = dayFmt.formatToParts(probe).reduce((o, x) => ({ ...o, [x.type]: x.value }), {});
    const y = Number(p.year), m = Number(p.month), d = Number(p.day), wd = WD[p.weekday];
    for (const s of series) {
      if (!s.weekdays.includes(wd)) continue;
      if (s.skipDates && s.skipDates.includes(`${p.year}-${p.month}-${p.day}`)) continue;
      const [sh, sm] = s.start.split(':').map(Number);
      const [eh, em] = s.end.split(':').map(Number);
      const start = pacificToUtc(y, m, d, sh, sm);
      const end = pacificToUtc(y, m, d, eh, em);
      if (end.getTime() < now.getTime()) continue; // already over
      out.push({
        title: s.title, category: s.category, start: start.toISOString(), end: end.toISOString(),
        location: s.location, url: s.url, description: s.description, source: 'Recurring',
      });
    }
  }
  return out;
}
