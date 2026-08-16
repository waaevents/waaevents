# Woodinville Creative Events

A small static site listing art, music, and comedy events happening in
Woodinville, WA — [woodinville-creative-events](https://waaevents.github.io/waaevents/)
(enable GitHub Pages to get the live URL; see below).

## How it works

- **`index.html`** — homepage with three panels (Art / Music / Comedy). Each
  panel's "More information" link goes to that category's page.
- **`art.html`, `music.html`, `comedy.html`** — list every upcoming event in
  that category, read from `data/events.json`.
- **`data/events.json`** — the event data. Regenerated automatically.
- **`scripts/update-events.mjs`** — a plain Node.js script (no AI) that:
  1. Fetches the public iCal feed published by
     [visitwoodinville.org](https://visitwoodinville.org/seasonal-events/),
     the official Woodinville tourism site, which aggregates events from
     wineries, breweries, and venues around town.
  2. Keeps events happening in the next 90 days.
  3. Sorts each event into `art`, `music`, or `comedy` by matching keywords
     in its title and description. Events that don't match any of the three
     categories (happy hours, farmers markets, trivia nights, etc.) are left
     out.
  4. Writes the result to `data/events.json`.

  The feed's default page only returns roughly the next week of events, and
  Woodinville's calendar skews heavily toward live music (wineries book it
  constantly), so the Art and Comedy pages may be empty on any given day —
  that's a real reflection of the source, not a bug. They fill back in as
  those events come up. See "Adding more event sources" below for how to
  broaden this.
- **`.github/workflows/update-events.yml`** — a GitHub Actions workflow that
  runs the script once a day (6am Pacific) and commits `data/events.json` if
  anything changed. You can also trigger it manually from the repo's
  **Actions** tab → "Update events" → **Run workflow**.

## Adding more event sources

`scripts/update-events.mjs` loops over a `FEEDS` array. Any site that
publishes a standard iCal (`.ics`) feed — most event-calendar plugins and
services do, usually via an "Export calendar" or "Subscribe" link — can be
added as another entry. Sites without an iCal feed (e.g. Eventbrite listing
pages) would need a different, site-specific scraping approach, which isn't
included here.

## Adjusting categorization

Keyword lists live in `CATEGORY_KEYWORDS` near the top of
`scripts/update-events.mjs`. Add or remove words there to tune what counts
as an art, music, or comedy event.

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
