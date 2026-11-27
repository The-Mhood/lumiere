## Production audit and launch checklist (current)

See **[PRODUCTION-AUDIT.md](PRODUCTION-AUDIT.md)** for the current production
audit, verification evidence, remaining gaps and the exact launch runbook for
branch `arena/22ae60e3-lumiere`. [deploy/README.md](deploy/README.md) contains
the persistent service setup, owned-media/Jellyfin/transcoding guides and the
authenticated preflight command. [FINAL-AUDIT.md](FINAL-AUDIT.md) is the previous
engineer's historical record.

## Media adapter stack

Playback sources resolve through a priority-ordered adapter stack with
timeouts, retries, per-adapter health reports and player fallback:

| Adapter | What it plays | TV episodes | Status |
| --- | --- | --- | --- |
| `owned-media` | Your storage/CDN or licensed HTTPS endpoints declared in a library JSON (`LUMIERE_OWNED_MEDIA_FILE`); output of `npm run media:transcode` | ✅ per-episode entries | Integration-tested (6 tests) |
| `jellyfin` | Your own Jellyfin server via its official API; direct MP4 + server-transcoded HLS fallback; API key stays server-side behind opaque same-origin grants | ✅ season/episode lookup by TMDB ID | Integration-tested (8 tests) + real-HTTP smoke |
| `web-scrapers` | Public player pages of operator-configured sites, observed by a private Chromium worker; verified HLS/MP4 relayed same-origin | Configurable `episodeUrl`, none live-verified | One movie site live-verified in CI |
| catalogue rows | Provider/source rows in PostgreSQL (e.g. Internet Archive imports) | ✅ episode rows | Tested |
| `blender` | Official Blender open-movie CDN sources (demo/test catalogue) | Caminandes shorts | Tested; demos opt-in only |

Supporting services: private **media worker** (`npm run media:worker`),
**source-health sweep** (`/api/admin/health`, called by the scheduler),
**transcoding pipeline** (`npm run media:transcode` → upload → `npm run
media:register`), and the recurring **catalogue sync** (`/api/admin/catalogue`).

TMDB supplies metadata/categories only — it never supplies video. Coverage is
the union of your configured sources; no adapter guarantees every title, and
no DRM/authentication/access-control bypass is implemented.

## Persistent deployment and live search

Start with **[deploy/README.md](deploy/README.md)** for the exact owner launch
steps: TMDB read token, Docker server/domain, generated private service secrets,
HTTPS, ongoing catalogue checks, and Windows/macOS server configuration.

Search now queries matching TMDB movie/TV metadata (when configured), separately
from the source-checked browsing catalogue. Real series/seasons/episodes can be
materialized without sample fixtures. This does not certify a working TV media
adapter. A bounded scheduler progressively checks platform/trending candidates;
it does not promise every movie or every platform is playable.

Production web/worker images built successfully and web health/platform/no-demo
smoke checks passed in [run 46027615252](https://github.com/The-Mhood/lumiere/actions/runs/46027615252).
A permanent server has **not** been provisioned, credentials are not supplied,
and TV/all-source playback remain incomplete. Demo title routes and old demo
history cards are also excluded from the default production UI.

## Public catalogue behaviour

Public browsing now excludes demo seeds and unverified imports: titles need a
successful source lookup in the last 24 hours. The Cinejoy-branded rail has been
removed. `/platforms` provides original-platform navigation with separate movie
and series views, using TMDB regional membership metadata and Lumière's own
on-demand player; it never redirects playback to Netflix/Prime/HBO.

Platform metadata still requires TMDB configuration, and TV episode playback and
multi-site coverage remain incomplete. See the newest section of `DELIVERY.md`.
Demo seeding is opt-in (`LUMIERE_SEED_DEMOS=1`), not a production default.

## Current connected movie preview

The full application and its private media worker now run together in a temporary
GitHub-runner development deployment. The actual app passed **The Godfather
(1972) playback and seek verification** in [run 46015195289](https://github.com/The-Mhood/lumiere/actions/runs/46015195289).
Port 3100 can display it using the ignored `LUMIERE_REMOTE_APP_URL` environment
setting; its banner includes a standalone link. Deployments expire after three
hours and account/history data is temporary. See the current section at the top
of `DELIVERY.md` for provisioning, verification, and limitations. This is one
movie-site adapter, not universal playback or permanent production hosting.

# Lumière

Next.js / React streaming catalogue with PostgreSQL + Drizzle, a Shaka HLS/DASH/MP4 player, and an Electron desktop shell. The existing application remains the foundation.

## On-demand discovery and playback

The application now separates **live TMDB discovery** from **on-click media resolution**.
With your server-side TMDB configuration, home shows trending/popular/current/top-rated
movies, genre rows and provider categories; search queries TMDB rather than requiring
imports. Only a clicked movie is persisted for history/watchlists.

The media resolver passes the clicked TMDB identity to an authenticated browser worker.
The supplied Cinejoy movie adapter observes normal public playback and relays verified
HLS media through same-origin, opaque grants. No placeholder film is substituted.
Additional sites need actual tested adapters and host allowlists; this is not a universal
"all sites/all films" scraper. See [worker setup and acceptance](scrapers/README.md).

Live on-demand resolution, independent Shaka playback and seeking passed for
**Inception, Interstellar and The Dark Knight** in
[run 45977527590](https://github.com/The-Mhood/lumiere/actions/runs/45977527590).
This does not certify all titles, episode support or the new worker in native installers.
The current sandbox lacks TMDB credentials and cannot directly reach Cinejoy; the
preview does not have this external worker deployed. Catalogue listings there are
not proof of active on-demand playback. See `DELIVERY.md` for current verification.

## Run locally

```sh
npm ci
npm run dev -- --hostname 0.0.0.0
```

No external database is needed: PGlite (embedded PostgreSQL/WASM) stores data in `.lumiere-data/`. First boot transactionally populates an empty catalogue. Set `DATABASE_URL` to retain a conventional PostgreSQL deployment. See `.env.example` for configuration. Embedded PGlite must be owned by **one server process**, not a multi-process/shared-filesystem deployment; use PostgreSQL for that topology.

Home, movies, series, search, title details, watch, library and settings are available in the app navigation. Accounts enable watchlists and continue watching. Device playback preferences also work without an account.

## Verification

```sh
npm test                  # isolated in-memory DB; no network required
npm run typecheck
npm run lint
npm run desktop:prepare   # production build with isolated build-worker DBs
```

The integration suite covers catalogue, auth, watchlist, progress and a mocked aggregator import. Resolver tests exercise timeout, retry, error isolation, normalization and fallback. These are **not** proof of successful live Internet video playback.

## Desktop builds

On the target OS:

```sh
npm run desktop       # build and launch Electron locally
npm run desktop:mac   # macOS DMG + ZIP
npm run desktop:win   # Windows NSIS installer
```

Output is in `release/` (ignored by Git). `.github/workflows/desktop.yml` builds on native macOS and Windows runners, launches each packaged executable, checks search/details/settings/restart plus live fallback playback, controls and media fullscreen, and uploads available installers. Workflow failures are release blockers, even when installer artifacts exist.

Hardware acceleration is enabled by default (`LUMIERE_DISABLE_GPU=1` is a diagnostic opt-out). macOS uses the ASCII bundle/executable name `Lumiere` with the accented display name, and reversible simple fullscreen for media to avoid Spaces transition races.

The shell runs the bundled standalone Next server using Electron's utility process; users need neither Node nor a development server. It binds only to loopback, uses a stable per-install port for storage persistence, generates a private installation auth secret, stores the embedded DB under Electron's OS user-data directory, blocks new windows and off-origin top-level navigation, and stops the server on quit. Server diagnostics are in `server.log` in that directory. Window dimensions and maximization persist. Native and media fullscreen use the application display bounds.

Installers are currently **unsigned** unless signing credentials are configured by the release team. Configure Apple Developer signing/notarization and Windows signing before public distribution. There is no automatic update service: install a newer version over the old version; application identity and user-data paths stay stable. Do not ship a database or `.env` file with an installer.

After building a native package, run `node scripts/desktop-smoke.mjs`. Manual release gates still include complete MP4/HLS/DASH endpoint coverage, subtitles/audio/quality, episode playback/progression, signed installation and upgrade on both platforms. All nine curated movies and live fallback/playback/control/fullscreen/restart checks passed on Windows x64, macOS Intel and macOS Apple Silicon. See `DELIVERY.md` for exact results and artifact links.

## Source engine

- `src/lib/streaming.ts`: normalized formats, subtitle schema, authorization, host rules, health-aware ranking.
- `src/lib/streaming/resolver.ts`: independent adapter contract (`search` / title matching / `resolve`), parallel provider isolation, bounded deadlines, retry, health reports, prioritized sources.
- `src/lib/streaming/blender.ts`: official full-film metadata, HLS/MP4 and VTT resolution for all nine curated movies; identity and host checks; verified-file outage fallback.
- `src/lib/streaming/providers.ts`: official provider plus separate configured-CDN catalogue adapters. Only stable public playback URLs are stored; adapters for expiring URLs must resolve them on demand.
- `GET /api/titles/:slug/sources?episodeId=...`: normalized sources and explicit provider reports.
- `GET /api/sources/:id/health`: bounded host-validated probe, body cancellation, short health cache. Old failures can be retried.
- `src/lib/aggregators/`: Internet Archive catalogue adapter and optional TMDB metadata/availability adapter. TMDB metadata/where-to-watch is **not** a playback provider. Configure its key before use.

The player handles source selection, bounded startup, fallback, retry, resume position, external/embedded subtitles and adaptive audio/quality controls. Settings select preferred tracks and next-episode autoplay. Availability of tracks and quality depends on the actual stream.

### Catalogue correctness / outstanding content work

The earlier seed attached unrelated demo films/trailers to several titles and every Caminandes episode. Those mappings are rejected, including on existing databases. **All nine curated movies now resolve through the official Blender Open Movies API**, with verified public-file backups for metadata outages. Live video requests and packaged Windows/macOS (Intel and Apple Silicon) playback have passed for every movie; see `DELIVERY.md` for the verification runs and updated installer. The adapter matches real Caminandes episode names, but episode playback/coverage is not yet verified and the fabricated second-season fixtures remain unavailable. The seed's existing metadata also requires editorial verification. Bundled covers are original typographic artwork, not official film posters.

A manually destructive catalogue reset requires `npm run db:seed -- --reset` and cascades into watch history/watchlists. Normal application startup never resets an existing catalogue. Schema bootstrap is idempotent, additive DDL matching `src/db/schema.ts`; future alterations require explicit versioned migrations.

## Delivery status

This branch delivers verified Windows x64 and macOS Intel/Apple Silicon test builds with all nine curated movies starting in each packaged player, **not a signed production release**. Native acceptance passed at `cb36925` in [run 45909171541](https://github.com/The-Mhood/lumiere/actions/runs/45909171541). See `DELIVERY.md`. Consult the native workflow results and complete the live-media/manual platform gates above before release. Do not represent unavailable catalogue mappings, unsigned builds, or unexecuted playback tests as completed features.
