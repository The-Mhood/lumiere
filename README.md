# Lumière

Next.js / React streaming catalogue with PostgreSQL + Drizzle, a Shaka HLS/DASH/MP4 player, and an Electron desktop shell. The existing application remains the foundation.

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
