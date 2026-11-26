# Lumière — premium, ad-free streaming platform

A production-style movie & series streaming application: content discovery, catalogue
filtering, detail pages, a Shaka-powered adaptive player (HLS + DASH, up to 4K), multi-source
switching with health-aware fallback, quality / subtitle / audio selection, authentication,
watchlists, resume playback and viewing history.

> **Licensing.** The reference sites (cinejoy / movy / 7movies) host unlicensed content. Lumière
> reproduces their *UX patterns* only. Every title in the seed catalogue is an openly licensed
> Blender Foundation open movie (CC BY) and every stream is served by an authorized public demo
> CDN. The provider layer enforces this: a source is never shown unless its provider is authorized
> and its URL host is on that provider's allow-list.

## Stack (as implemented)

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 | Server components for data, client components for the player/nav |
| Backend | Next.js route handlers (REST under `/api`) | Same contract can be ported to FastAPI; see "Architecture" |
| Database | PostgreSQL + Drizzle ORM | Schema in `src/db/schema.ts`, push with `drizzle-kit` |
| Cache | `src/lib/cache.ts` TTL cache with a Redis-shaped `get/set/del` API | Swap for ioredis via `REDIS_URL` |
| Player | Shaka Player 5 | ABR, DASH + HLS, text/audio track APIs, progressive MP4 fallback |
| Auth | bcryptjs + jose (HS256 JWT in httpOnly cookie) | `AUTH_SECRET` env var |
| Tests | Vitest | Unit (streaming rules) + integration (DB, auth, watchlist, progress) |

The brief requested FastAPI/SQLAlchemy; the sandbox provides a Next.js + Drizzle runtime, so the
REST API lives in Next route handlers. The modules are separated so a Python service can replace
them endpoint-for-endpoint (`/api/titles`, `/api/titles/:slug`, `/api/search`, `/api/auth/*`,
`/api/watchlist`, `/api/progress`, `/api/sources/:id/health`).

## Architecture

```
src/
  db/schema.ts          titles, genres, people/credits, seasons, episodes,
                        providers, sources, users, watchlist, watch_progress
  db/seed.ts            open-licensed catalogue + authorized providers/sources
  lib/streaming.ts      PURE source rules: format detection, host allow-list,
                        authorization, health-aware ranking (unit tested)
  lib/content.ts        catalogue queries, home rails, title detail, continue watching
  lib/auth.ts           sessions, password hashing
  lib/cache.ts          TTL cache (Redis contract)
  app/api/**            REST handlers
  components/player/    VideoPlayer (Shaka lifecycle, fallback, progress beacons)
                        Controls (seek, volume, speed, PiP, fullscreen, menus, shortcuts)
```

### Streaming-source model
Each movie / episode has N `sources`, each belonging to a `provider`:
provider name, playback URL, format (`hls | dash | mp4`), resolutions, audio & subtitle
languages, external subtitle files, health status, priority.

`rankSources()` filters out unauthorized providers, URL/host mismatches, format mismatches and
offline sources, then orders by health → provider priority → source priority → best resolution.
The player walks this list: if a manifest fails to load or Shaka raises a critical error, the
source is marked failed and playback moves to the next server automatically.
`GET /api/sources/:id/health` probes a source server-side and persists `status` so demoted
sources sink in the ranking for everyone. Adding a provider = one row in `providers` plus its
sources; no application code changes.

### Player
* DASH/HLS via Shaka with ABR; MP4 via the native element with `<track>` subtitles.
* Quality menu (Auto or pinned rendition, 4K/UHD badges), subtitle and audio menus built from
  live track inventory, speed 0.5–2×, PiP, fullscreen, auto-hiding controls.
* Keyboard: Space/K, ←/→ 5 s, J/L 10 s, ↑/↓ volume, M, F, P, C, `<`/`>` speed, 0–9 jump, Shift+N next.
* Progress beacons every 5 s + on pause/unload; resume offered on return; ≥95 % marks complete.
* Subtitle preference persisted to the user profile and applied as Shaka `preferredTextLanguage`.

## Running

```bash
cp .env.example .env            # DATABASE_URL, AUTH_SECRET
npm install
npx drizzle-kit push            # create tables
npx tsx src/db/seed.ts          # seed catalogue
npm run dev                     # http://localhost:3000
```

### Tests
```bash
npx vitest run                  # requires DATABASE_URL (integration tests hit the DB)
```

### Deployment
* Build: `npm run build` → `npm start` (Node 20+). Set `DATABASE_URL`, `AUTH_SECRET`, optional `REDIS_URL`.
* Docker: `node:20-alpine`, `npm ci && npm run build`, `CMD ["npm","start"]`; run `drizzle-kit push`
  (or `drizzle-kit generate` + `migrate` for versioned migrations) as a release step.
* Put the app behind a CDN; video is already CDN-delivered by the providers. For self-hosted
  licensed content: transcode with FFmpeg to CMAF (HLS + DASH ladders up to 2160p), upload to
  object storage, register a `provider` whose `allowedHosts` is your CDN hostname.

## Verified in this build
* 9 automated tests passing (format validation, host allow-list incl. wildcards, authorization,
  ranking; catalogue filters/sort/search; unauthorized provider hidden; series/episodes/sources;
  registration validation; login success/failure; watchlist add/remove; progress upsert & completion).
* HTTP smoke test: all pages 200, source health probes report `online`, register → progress →
  library → "Continue watching" rail populated.

## Multi-platform aggregation

Lumière aggregates content from other platforms through **adapters** (`src/lib/aggregators/`):

| Adapter | What it does | Needs |
| --- | --- | --- |
| `internet-archive` | Imports full-length public-domain / CC feature films (metadata, poster, MP4 renditions, licence) as playable titles with an `archive-org` provider | nothing |
| `tmdb` | Enriches titles with legal **"Where to watch"** availability (Netflix, Prime Video, Apple TV, Disney+, YouTube… via TMDB/JustWatch) with deep links to the platform | `TMDB_API_KEY` |

* Run: `npm run aggregate -- internet-archive 40` or `POST /api/aggregate/sync?adapter=internet-archive&limit=40`
  (protect with `AGGREGATOR_TOKEN`). Schedule it with cron / a worker for continuous aggregation.
* Dashboard: `/aggregators` — adapter status, per-run import/update/skip counts, platforms indexed, Sync button.
* Imports are idempotent (`titles.external_source + external_id`), sources are validated against the
  provider allow-list before insert, and availability is upserted per (title, platform, kind, region).
* UI: "Public-domain classics" rail on the homepage, **Platform** filter in the catalogue,
  "Where to watch" section on every detail page.

**Why not scrape pirate embed hosts like the reference sites?** They redistribute copyrighted films
without licences. Lumière's aggregator only ingests platforms that are authorized to serve the content,
and for everything else it *points users to* the legal platform instead of re-hosting it.
