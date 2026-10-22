// Fuzzy de-duplication of events that two sources both list.
//
// Same venue + starts within 90 minutes + titles that share at least one
// distinctive word => the same event. This catches the cases an exact
// title+time key misses, e.g. a hand-added "Music Featuring Sedona Rose at
// LaShellé Wines" and the winery's own "Thursday night Music Sedona Rose",
// or "Boot Camp Line Dancing at LaShellé Wines" vs "LASHELLÉ WINES BOOT CAMP".
// When two match, the one from an automated feed wins over a manual entry.

const GENERIC = new Set([
  'at', 'the', 'a', 'an', 'and', 'of', 'in', 'on', 'with', 'featuring', 'feat', 'music', 'live', 'night', 'wines',
  'wine', 'cellars', 'cellar', 'winery', 'vineyards', 'vineyard', 'tasting', 'room', 'event', 'class', 'by', 'for',
  'to', 'presents', 'sessions', 'session', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

function fold(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function words(s) {
  return fold(s).replace(/&[a-z#0-9]+;/g, ' ').split(/[^a-z0-9]+/).filter(Boolean);
}
function venueOf(location) {
  return words(String(location || '').split(',')[0]).join('');
}

export function fuzzyDedupe(events) {
  // Feed events first so they win over manual ones.
  const ordered = [...events].sort((a, b) => (a.source === 'Manually added') - (b.source === 'Manually added'));
  const kept = [];
  const dropped = [];
  for (const ev of ordered) {
    const venue = venueOf(ev.location);
    const t = new Date(ev.start).getTime();
    const venueWords = new Set(words(String(ev.location || '').split(',')[0]));
    const toks = new Set(words(ev.title).filter((w) => !GENERIC.has(w) && !venueWords.has(w) && w.length > 1));
    const dup = venue && kept.find((k) => {
      if (venueOf(k.location) !== venue) return false;
      if (Math.abs(new Date(k.start).getTime() - t) > 90 * 60000) return false;
      const kw = new Set(words(String(k.location || '').split(',')[0]));
      const ktoks = words(k.title).filter((w) => !GENERIC.has(w) && !kw.has(w) && w.length > 1);
      return ktoks.some((w) => toks.has(w));
    });
    if (dup) dropped.push({ dropped: ev, keptAs: dup }); else kept.push(ev);
  }
  kept.sort((a, b) => new Date(a.start) - new Date(b.start));
  return { events: kept, dropped };
}
