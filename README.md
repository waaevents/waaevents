# Woodinville Creative Events

A small static site listing every event it can find happening in
Woodinville, WA, sorted into Art, Music, Comedy, Food & Drink, and
Community & More —
[woodinville-creative-events](https://waaevents.github.io/waaevents/)
(enable GitHub Pages to get the live URL; see below).

## How it works

- **`index.html`** — homepage with five panels (Art / Music / Comedy /
  Food & Drink / Community & More). Each panel's "More information" link
  goes to that category's page.
- **`art.html`, `music.html`, `comedy.html`, `food-drink.html`,
  `community.html`** — list every upcoming event in that category, read
  from `data/events.json`.
- **`data/events.json`** — the event data. Regenerated automatically.
- **`data/manual-events.json`** — hand-maintained events for venues without
  an automated feed (see "Manually adding an event" below). Merged in on
  every run; not touched by the automated commit.
- **`scripts/update-events.mjs`** — a plain Node.js script (no AI) that:
  1. Fetches the public iCal feeds of two independent Woodinville
     organizations:
     - [visitwoodinville.org](https://visitwoodinville.org/seasonal-events/)
       — the official Woodinville tourism site.
     - [woodinvillechamber.org](https://woodinvillechamber.org/cal-events/category/community-events/)
       — the Woodinville Chamber of Commerce's community events calendar.

     Each feed's "list" view only returns about a week of events per
     request — there's no reliably guessable way to page further out (an
     earlier attempt at guessing a dated-pagination URL silently returned
     an empty calendar and blanked the live site; see the git history).
     Extending coverage further out would mean using whatever exact
     "Next Events" URL a feed's own pagination link actually points to,
     confirmed by fetching it, not assumed from a pattern.
  2. Merges both feeds and dedupes: first by event UID (catches a feed
     returning the same event twice), then by matching title + start time
     (catches the *same real event* being listed independently on both
     sites with two different UIDs — which happens, since they're
     separate WordPress installs).
  3. Keeps events happening in the next 90 days.
  4. Sorts each event into a category:
     - `art`, `music`, `comedy` — by matching genre keywords in the title,
       then the description (e.g. "live music", "stand-up", "art walk",
       "karaoke", "hat making", "paint and sip").
     - Certain venues are treated as a genre regardless of title — e.g.
       anything at Chateau Ste. Michelle's amphitheater is Music, since
       its concert listings are just artist names ("Boyz II Men") with
       nothing else to keyword-match.
     - `food-drink` — anything not already matched above, whose location,
       title, or description names a brewery, distillery, cafe, restaurant,
       or a "happy hour" (e.g. "Northwest Spirits", "Ruff Draft taproom",
       "Woodinville Whiskey"). Wineries/tasting rooms are deliberately
       excluded from this category since they already dominate Music via
       "live music at ___" events — a winery's own happy hour or tasting
       (not a keyword match) falls to Community & More instead.
     - `community` — everything else (farmers markets, museum hours,
       festivals, wellness classes, etc.). Nothing gets silently dropped;
       every event either feed returns ends up in one of the five
       categories.
  5. Writes the result to `data/events.json`.
- **`.github/workflows/update-events.yml`** — a GitHub Actions workflow that
  runs the script once a day (6am Pacific) and commits `data/events.json` if
  anything changed. You can also trigger it manually from the repo's
  **Actions** tab → "Update events" → **Run workflow**.

## Manually adding an event

For a venue with no automated feed (see "Sources considered but not
included" above), add an entry to `data/manual-events.json` — a plain JSON
array, e.g.:

```json
{
  "title": "Live Music: Some Artist",
  "category": "music",
  "start": "2026-08-22T22:00:00.000Z",
  "location": "Venue Name, Street Address, Woodinville, WA 98072",
  "url": "https://venue-site.com/events/some-artist/",
  "description": "One or two sentences, from the venue's own event page."
}
```

Rules that keep this trustworthy instead of turning into guesswork:
- `start` is UTC (`Z`) — Woodinville is Pacific time, so convert
  (PDT is UTC-7 in summer, PST is UTC-8 in winter).
- Only add an event you've verified on the venue's own page, with a real
  URL and a date that hasn't passed yet — never a guessed date or a stale
  listing surfaced by a search engine (this has happened: a search result
  for a "current" show turned out to be from months earlier).
  `category` is one of `art`, `music`, `comedy`, `food-drink`, `community`.
- No need to remove old entries by hand — anything whose `start` has
  passed is automatically left out of `data/events.json`, though pruning
  the file itself occasionally keeps it tidy.
- If the same event later shows up in an automated feed, it'll collapse
  into one listing (same dedup rules as everything else), not double up.

## Sources considered but not included

A few names come up often for Woodinville events but don't have a
plain-scrapable feed, so they're not wired in:
- **Dani Marie Productions/Talent** — a local booking agency behind a lot
  of the live music and comedy at area wineries (Fidelitas, Long Shadows,
  Chandler Reach, Maryhill, and others). Their listings live on Instagram
  and Facebook, which don't offer a simple public feed.
- **woodinvillewinecountry.com** — a second, separate wine-industry
  events site with its own listings (e.g. winery bingo nights, release
  parties). Its event pages didn't show an iCal export the way
  visitwoodinville.org and the Chamber site do; would need a different
  scraping approach to include.
- **The SOMM Hotel's "Happenings" page** — has its own recurring event
  series (industry nights, weekly winery dinners) but publishes them as a
  plain content page, not a calendar feed.

## Adding more event sources

`scripts/update-events.mjs` builds its feed list from
`buildVisitWoodinvilleFeeds()` plus an `EXTRA_FEEDS` array. Any site that
publishes a standard iCal (`.ics`) feed — most event-calendar plugins and
services do, usually via an "Export calendar" or "Subscribe" link — can be
added to `EXTRA_FEEDS`. Always use the exact URL the source site shows for
that link, never a guessed/constructed one. Sites without an iCal feed
(e.g. Eventbrite listing pages, Instagram/Facebook) would need a
different, site-specific scraping approach, which isn't included here.

## Adjusting categorization

Keyword lists live near the top of `scripts/update-events.mjs`:
`GENRE_KEYWORDS` (art/music/comedy), `VENUE_GENRE_KEYWORDS` (venues that
imply a genre, like Chateau Ste. Michelle → music), and
`FOOD_DRINK_KEYWORDS` (breweries/restaurants/cafes/distilleries/happy
hours). Add or remove words there to tune what counts as each category.
Anything that matches nothing falls back to `community`.

## Running it locally

```bash
npm install
npm run update-events   # writes data/events.json
```

Then serve the folder with any static file server (e.g. `npx serve .`) and
open `index.html` — the pages fetch `data/events.json` with a relative
path, so opening the file directly (`file://`) won't load it.

## Enabling GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → Branch: **main**,
folder **/ (root)**. Note this repo is served at a subpath
(`waaevents.github.io/waaevents/`), which is why every internal link uses
relative paths rather than a leading `/`.
