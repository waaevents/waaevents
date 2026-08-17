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
- **`scripts/update-events.mjs`** — a plain Node.js script (no AI) that:
  1. Sweeps the public iCal feed published by
     [visitwoodinville.org](https://visitwoodinville.org/seasonal-events/),
     the official Woodinville tourism site, which aggregates events from
     wineries, breweries, and venues around town. The feed's "list" view
     only returns about a week of events per request, so the script
     requests it repeatedly with a different start date (every 6 days,
     covering the full 90-day window) and merges the results, deduping by
     event UID — this is what gets every event across the full window
     instead of just the next few days.
  2. Keeps events happening in the next 90 days.
  3. Sorts each event into a category:
     - `art`, `music`, `comedy` — by matching genre keywords in the title,
       then the description (e.g. "live music", "stand-up", "art walk",
       "karaoke", "hat making", "paint and sip").
     - Certain venues are treated as a genre regardless of title — e.g.
       anything at Chateau Ste. Michelle's amphitheater is Music, since
       its concert listings are just artist names ("Boyz II Men") with
       nothing else to keyword-match.
     - `food-drink` — anything not already matched above, whose location,
       title, or description names a brewery, distillery, cafe, or
       restaurant (e.g. "Northwest Spirits", "Ruff Draft taproom").
       Wineries/tasting rooms are deliberately excluded from this category
       since they already dominate Music via "live music at ___" events.
     - `community` — everything else (farmers markets, museum hours,
       festivals, wellness classes, etc.). Nothing gets silently dropped;
       every event the feed returns ends up in one of the five categories.
  4. Writes the result to `data/events.json`.
- **`.github/workflows/update-events.yml`** — a GitHub Actions workflow that
  runs the script once a day (6am Pacific) and commits `data/events.json` if
  anything changed. You can also trigger it manually from the repo's
  **Actions** tab → "Update events" → **Run workflow**.

## Adding more event sources

`scripts/update-events.mjs` builds its feed list from
`buildVisitWoodinvilleFeeds()` (the paginated sweep above) plus an
`EXTRA_FEEDS` array. Any site that publishes a standard iCal (`.ics`) feed
— most event-calendar plugins and services do, usually via an "Export
calendar" or "Subscribe" link — can be added to `EXTRA_FEEDS`. Sites
without an iCal feed (e.g. Eventbrite listing pages) would need a
different, site-specific scraping approach, which isn't included here.

## Adjusting categorization

Keyword lists live near the top of `scripts/update-events.mjs`:
`GENRE_KEYWORDS` (art/music/comedy), `VENUE_GENRE_KEYWORDS` (venues that
imply a genre, like Chateau Ste. Michelle → music), and
`FOOD_DRINK_KEYWORDS` (breweries/restaurants/cafes/distilleries). Add or
remove words there to tune what counts as each category. Anything that
matches nothing falls back to `community`.

## Running it locally

```bash
npm install
npm run update-events   # writes data/events.json
```

Then open `index.html` in a browser (or serve the folder with any static
file server — the pages fetch `/data/events.json` with an absolute path, so
a local server, e.g. `npx serve .`, works better than opening the file
directly).

## Enabling GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → Branch: **main**,
folder **/ (root)**.
