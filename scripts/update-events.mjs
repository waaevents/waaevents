// Fetches public Woodinville-area event calendar feed(s), keyword-categorizes
// each event into art / music / comedy / food-drink, and writes data/events.json.
//
// No AI involved by design: this is a plain ICS calendar parse + keyword match.
// Run manually with: node scripts/update-events.mjs
// Run automatically by .github/workflows/update-events.yml (daily cron).

import ical from 'node-ical';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Add more feeds here over time — anything that publishes a standard iCal
// (.ics) feed of Woodinville-area events can be dropped in.
const FEEDS = [
  {
    name: 'Visit Woodinville',
    url: 'https://visitwoodinville.org/events/list/?ical=1&shortcode=f0b1cb7d',
  },
];

// Genre keywords. Checked against the title first (stronger signal), then
// the description if the title doesn't match anything.
const GENRE_KEYWORDS = {
  art: [
    'art walk', 'art in the wineries', 'art exhibit', 'gallery', 'painting',
    'paint night', 'paint & sip', 'artist', 'exhibition', 'pottery',
    'sculpture', 'mural', 'watercolor', 'ceramic', 'craft fair', 'art show',
  ],
  music: [
    'live music', 'concert', 'music bingo', 'music showcase', 'band',
    'acoustic', 'singer-songwriter', 'songwriter', 'jazz', 'orchestra',
    'choir', 'sing-along', 'synne sessions', 'world music', 'live at',
    'performing live', 'dj set',
  ],
  comedy: [
    'comedy', 'comedian', 'stand-up', 'stand up', 'standup', 'improv',
    'open mic comedy', 'sketch comedy', 'jokes for evermore',
  ],
};

// Food & Drink: matched by venue type, not genre — breweries, restaurants,
// cafes, and distilleries specifically (not wineries/tasting rooms, which
// already dominate the Music category via "live music at ___" events).
// Checked against the combined location + title + description, and only
// after the genre keywords above have had a chance to match — so a "Live
// Music at ___ Brewing" event still lands under Music, not here.
const FOOD_DRINK_KEYWORDS = [
  'brewery', 'brewing', 'taproom', 'tap room', 'pub',
  'distillery', 'distilling', 'spirits',
  'cafe', 'café', 'coffee', 'roastery',
  'restaurant', 'bistro', 'eatery', 'kitchen', 'diner', 'grill', 'pizzeria',
  'gastropub', 'bakery',
];

const WINDOW_DAYS = 90;

function categorize(title, description, location) {
  const t = title.toLowerCase();
  const d = (description || '').toLowerCase();
  const l = (location || '').toLowerCase();

  for (const [cat, words] of Object.entries(GENRE_KEYWORDS)) {
    if (words.some((w) => t.includes(w))) return cat;
  }
  for (const [cat, words] of Object.entries(GENRE_KEYWORDS)) {
    if (words.some((w) => d.includes(w))) return cat;
  }

  const combined = `${l} ${t} ${d}`;
  if (FOOD_DRINK_KEYWORDS.some((w) => combined.includes(w))) {
    return 'food-drink';
  }

  return null;
}

function cleanDescription(desc) {
  if (!desc) return '';
  let text = String(desc);
  text = text.replace(/\[\/?vc_[^\]]*\]/g, ' '); // strip WPBakery shortcodes
  text = text.replace(/<[^>]+>/g, ' ');            // strip any HTML tags
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

async function fetchFeed(feed) {
  const data = await ical.async.fromURL(feed.url);
  return Object.values(data).filter((ev) => ev && ev.type === 'VEVENT');
}

async function main() {
  const now = new Date();
  const maxDate = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const seen = new Set();
  const events = [];
  let anyFeedSucceeded = false;

  for (const feed of FEEDS) {
    try {
      const rawEvents = await fetchFeed(feed);
      anyFeedSucceeded = true;
      for (const ev of rawEvents) {
        if (!ev.start) continue;
        const start = new Date(ev.start);
        if (Number.isNaN(start.getTime())) continue;
        if (start < now || start > maxDate) continue;

        const title = (ev.summary || 'Untitled event').toString().trim();
        const description = cleanDescription(ev.description);
        const location = (ev.location || '').toString().trim();
        const category = categorize(title, description, location);
        if (!category) continue;

        const uid = ev.uid || `${title}-${start.toISOString()}`;
        if (seen.has(uid)) continue;
        seen.add(uid);

        events.push({
          id: uid,
          title,
          category,
          start: start.toISOString(),
          location,
          url: (ev.url || '').toString().trim(),
          description: description.slice(0, 280),
          source: feed.name,
        });
      }
      console.log(`Fetched ${rawEvents.length} raw events from ${feed.name}`);
    } catch (err) {
      console.error(`Failed to fetch/parse ${feed.name}: ${err.message}`);
    }
  }

  if (!anyFeedSucceeded) {
    console.error('All feeds failed — leaving existing data/events.json untouched.');
    process.exit(1);
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));

  const output = {
    updatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    count: events.length,
    events,
  };

  await mkdir('data', { recursive: true });
  await writeFile(
    path.join('data', 'events.json'),
    JSON.stringify(output, null, 2) + '\n',
  );

  const counts = events.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1;
    return acc;
  }, {});
  console.log(`Wrote ${events.length} categorized events to data/events.json`, counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
