// Fetches public Woodinville-area event calendar feed(s), keyword-categorizes
// each event into art / music / comedy / food-drink / community, and writes
// data/events.json.
//
// No AI involved by design: this is a plain ICS calendar parse + keyword
// match. Run manually with: node scripts/update-events.mjs
// Run automatically by .github/workflows/update-events.yml (daily cron).

import ical from 'node-ical';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const WINDOW_DAYS = 90;

// The Visit Woodinville feed's "list" view only returns roughly the next
// week of events. A previous version of this script tried to page through
// the full WINDOW_DAYS by guessing a dated-URL pattern
// (/events/list/YYYY-MM-DD/?ical=1&...) — that pattern turned out to be
// wrong: it doesn't error, it just silently returns an empty calendar, so
// the site briefly went live with zero events. Reverted to the single
// feed URL that's actually verified to return real events. If someone
// wants to extend coverage further out, the reliable way is to open the
// site's "Next Events" pagination link in a real browser, check what URL
// it actually requests, and use that — not guess at the pattern.
function buildVisitWoodinvilleFeeds() {
  return [
    {
      name: 'Visit Woodinville',
      url: 'https://visitwoodinville.org/events/list/?ical=1&shortcode=f0b1cb7d',
    },
  ];
}

// Add more feeds here over time — anything that publishes a standard iCal
// (.ics) feed of Woodinville-area events can be dropped in alongside the
// Visit Woodinville feed above. Each entry's URL should be one actually
// shown on the source site as its own "Export .ics" / "Subscribe" link —
// never a guessed/constructed URL (see the pagination note above for why).
const EXTRA_FEEDS = [
  {
    name: 'Woodinville Chamber (Community Events)',
    // Verified against the site's own "Export .ics file" link on
    // https://woodinvillechamber.org/cal-events/category/community-events/
    url: 'https://woodinvillechamber.org/cal-events/category/community-events/list/?ical=1',
  },
];

// Genre keywords. Checked against the title first (stronger signal), then
// the description if the title doesn't match anything.
const GENRE_KEYWORDS = {
  art: [
    'art walk', 'art in the wineries', 'art exhibit', 'gallery', 'painting',
    'paint night', 'paint & sip', 'paint and sip', 'artist', 'exhibition',
    'pottery', 'sculpture', 'mural', 'watercolor', 'ceramic', 'craft fair',
    'art show', 'living history', 'living voices', 'theatre', 'theater',
    'hat making', 'wreath making',
  ],
  music: [
    'live music', 'concert', 'music bingo', 'music showcase', 'band',
    'acoustic', 'singer-songwriter', 'songwriter', 'jazz', 'orchestra',
    'choir', 'sing-along', 'synne sessions', 'world music', 'live at',
    'performing live', 'dj set', 'karaoke',
  ],
  comedy: [
    'comedy', 'comedian', 'stand-up', 'stand up', 'standup', 'improv',
    'open mic comedy', 'sketch comedy', 'jokes for evermore',
  ],
};

// Some venues are strongly associated with one genre regardless of what
// the event title says — Chateau Ste. Michelle's amphitheater, for
// instance, lists shows under just the artist's name ("Bob Dylan", "Boyz
// II Men"), with nothing in the title or description to keyword-match.
// Checked against location only, after the title/description genre
// keywords above have had a chance to match.
const VENUE_GENRE_KEYWORDS = {
  music: ['chateau ste. michelle', 'chateau ste michelle', 'ste. michelle amphitheatre'],
};

// Food & Drink: matched by venue type, not genre — breweries, restaurants,
// cafes, and distilleries specifically (not wineries/tasting rooms, which
// already dominate the Music category via "live music at ___" events).
// Checked against the combined location + title + description, and only
// after the genre keywords above have had a chance to match — so a "Live
// Music at ___ Brewing" event still lands under Music, not here.
const FOOD_DRINK_KEYWORDS = [
  'brewery', 'brewing', 'taproom', 'tap room', 'pub',
  'distillery', 'distilling', 'spirits', 'whiskey', 'whisky',
  'cafe', 'café', 'coffee', 'roastery',
  'restaurant', 'bistro', 'eatery', 'kitchen', 'diner', 'grill', 'pizzeria',
  'gastropub', 'bakery', 'happy hour',
];

// Anything that doesn't match a genre or a food & drink venue still lands
// on the site — under Community & More — instead of being silently
// dropped. This is what makes "every event, every venue" true: farmers
// markets, museum hours, festivals, wellness classes, trivia at venues
// that aren't breweries/restaurants/cafes/distilleries, etc.
const FALLBACK_CATEGORY = 'community';

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
  for (const [cat, words] of Object.entries(VENUE_GENRE_KEYWORDS)) {
    if (words.some((w) => l.includes(w))) return cat;
  }

  const combined = `${l} ${t} ${d}`;
  if (FOOD_DRINK_KEYWORDS.some((w) => combined.includes(w))) {
    return 'food-drink';
  }

  return FALLBACK_CATEGORY;
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
  // Fetch with our own headers rather than relying on node-ical's default
  // request behavior — some sites (Wordfence/Cloudflare-protected WP
  // installs, which a lot of small-business calendars run behind) block
  // requests that don't look like they came from a browser.
  const res = await fetch(feed.url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/calendar, text/plain, */*',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const data = ical.sync.parseICS(text);
  return Object.values(data).filter((ev) => ev && ev.type === 'VEVENT');
}

async function main() {
  const now = new Date();
  const maxDate = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const feeds = [
    ...buildVisitWoodinvilleFeeds(),
    ...EXTRA_FEEDS,
  ];

  const seenIds = new Set();
  const seenTitleTime = new Set();
  const events = [];
  let feedsSucceeded = 0;
  let feedsFailed = 0;

  for (const feed of feeds) {
    try {
      const rawEvents = await fetchFeed(feed);
      feedsSucceeded += 1;
      let addedFromThisFeed = 0;
      for (const ev of rawEvents) {
        if (!ev.start) continue;
        const start = new Date(ev.start);
        if (Number.isNaN(start.getTime())) continue;
        if (start < now || start > maxDate) continue;

        const uid = ev.uid || `${ev.summary}-${start.toISOString()}`;
        if (seenIds.has(uid)) continue;
        seenIds.add(uid);

        const title = (ev.summary || 'Untitled event').toString().trim();

        // Two independent sites can each list the same real-world event
        // under their own UID (e.g. a Watts Brewing show submitted to both
        // Visit Woodinville and the Chamber calendar) — UID alone won't
        // catch that. Treat identical title + start time as the same
        // event and keep only the first one seen.
        const titleTimeKey = `${title.toLowerCase()}|${start.toISOString()}`;
        if (seenTitleTime.has(titleTimeKey)) continue;
        seenTitleTime.add(titleTimeKey);

        const description = cleanDescription(ev.description);
        const location = (ev.location || '').toString().trim();
        const category = categorize(title, description, location);

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
        addedFromThisFeed += 1;
      }
      console.log(`${feed.name}: ${rawEvents.length} raw, ${addedFromThisFeed} new`);
    } catch (err) {
      feedsFailed += 1;
      console.error(`Failed to fetch/parse ${feed.name}: ${err.message}`);
    }
  }

  if (feedsSucceeded === 0) {
    console.error('All feeds failed — leaving existing data/events.json untouched.');
    process.exit(1);
  }

  // Safety net: a feed request can "succeed" (no network/parse error) but
  // still return zero usable events — e.g. a wrong URL that resolves to
  // an empty-but-valid calendar instead of a 404. That's exactly what
  // broke the site earlier today. Refuse to overwrite good existing data
  // with a suspiciously empty result; fail loudly instead so it shows up
  // in the Actions tab rather than silently blanking the live site.
  if (events.length === 0) {
    console.error(
      'Feed(s) responded but produced zero events — treating this as a ' +
      'failure and leaving existing data/events.json untouched.',
    );
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
  console.log(
    `Wrote ${events.length} events (${feedsSucceeded} feed requests ok, ${feedsFailed} failed) to data/events.json`,
    counts,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
