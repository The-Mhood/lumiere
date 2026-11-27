# On-demand playback worker

Discovery and playback are separate. TMDB supplies live movie search, category,
provider and genre rows; opening a TMDB movie creates only that clicked record
for watchlists/history. Its TMDB identity is passed to the media resolver.
No film import is necessary before searching or resolving it.

The resolver calls an authenticated browser worker. Each scrape opens a fresh,
non-account context, visits a configured public player, presses Play and observes
successful HLS/DASH/MP4 responses. It never exports cookies/request headers,
executes extracted resolver code, or circumvents login, captcha or DRM.
Manifest bodies and hostnames are checked; blob URLs and media segments are not
returned as full movies. Missing/failed media remains unavailable.

## Run

1. Install the repository dependencies (`npm ci`, including development tools)
   and worker browser: `npx playwright install --with-deps chromium`.
2. Generate a random worker secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   Store it in the deployment environment as `LUMIERE_MEDIA_WORKER_TOKEN`, not in Git.
3. Run `MEDIA_WORKER_PORT=3200 npm run media:worker`.
4. Configure Next with the same token and `LUMIERE_MEDIA_WORKER_URL` pointing to
   the worker. A local worker uses `http://127.0.0.1:3200`; a separately hosted
   worker must use an HTTPS URL reachable **by the backend**. The browser never
   calls that address or receives the worker secret. Restart Next after changing
   these settings.
5. Set your own `TMDB_READ_ACCESS_TOKEN` or `TMDB_API_KEY` on Next to enable full
   live movie discovery. `TMDB_WATCH_REGION` controls provider category listings.

The supplied site configuration currently contains **one movie adapter:
Cinejoy**. Additional sites require actual adapter URLs/selectors and verified
media-host allowlists in `sites.json` (or `LUMIERE_SCRAPER_SITES`). Add matching
`id`, `name`, `mediaHosts` entries to the app's `LUMIERE_SCRAPER_PROVIDERS` JSON
when overriding this file. Movie URL templates support `{tmdbId}`; episode URL
templates support `{tmdbId}`, `{season}` and `{episode}`. A site without an
episode URL is explicitly movie-only, not silently treated as episode support.

Timeouts, concurrency limits, private-address checks, fresh contexts and popup
blocking isolate failures. Do not expose the worker without its bearer token.
Media URLs are response data, not database writes. HLS/MP4 relay grants use opaque
same-origin paths and host-scoped targets, not arbitrary URLs. HLS media is fetched
within the normal public page origin without extracting headers/cookies or disabling
CORS. Retained anonymous contexts expire after 15 idle minutes (four context capacity
per worker). DASH sources remain direct. Observing a source does not certify playback.

## Acceptance

`npm run test:media-live` starts a temporary authenticated worker, resolves
Inception (TMDB 27205) without a catalogue import, retains an isolated public fetch context for the media relay,
and plays it with Shaka in a separate browser context/origin.
It requires time advancement, a seek to two minutes, and approximately the full-film duration. The CI
workflow `.github/workflows/media-scraper.yml` tests Inception, Interstellar and The Dark Knight and emits a
sanitized report (no media URLs/secrets). **A passing unit test or successful
scrape is not a passing playback test.**

The current preview sandbox cannot connect directly to Cinejoy (`ERR_CONNECTION_CLOSED`)
and contains no TMDB credential. Running the worker here does not overcome that
network restriction. A reachable deployment and valid TMDB configuration are
required before representing live discovery/playback as active in that preview.
The browser worker is a separate service; it is not yet bundled into the native
installers. Existing native nine-film acceptance does not certify this new path.
