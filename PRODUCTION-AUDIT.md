# Lumière — production audit & launch runbook

**Auditor:** post-production engineering · **Date:** 2026-11-27 · **Branch:** `arena/22ae60e3-lumiere`
**Scope:** implementation and execution readiness. Licensing/commercial terms are the owner's responsibility and are not evaluated here.

---

## 1. Executive summary

The product is a working, tested streaming platform: TMDB-driven discovery and categories, a priority-based multi-source resolver, an isolated Chromium scraping worker, same-origin media relays, a Shaka player with health-aware fallback, accounts/watchlists/history, Docker deployment with HTTPS, and Electron packaging for Windows/macOS.

This session found and fixed a **critical repository-state problem**, then closed the largest implementation gaps that were actionable without owner credentials:

1. **Branch recovery.** `main` (`f55af41`) did not contain the previous engineer's work — it lived only on the unmerged remote branch `arena/e423f162-lumiere` (`eca73a7`, the commit their report references). This working branch was fast-forwarded to that state, so nothing was lost and all prior verification carries over. **Merge this branch to `main` before launch** so deployments and CI track one lineage. PR #1 (`fix/catalog-import-from-owned-sites`) is a parallel, superseded lineage — review and close it rather than merging (it would conflict).
2. **New adapters:** `owned-media` (your storage/CDN/licensed endpoints, movies + episodes) and `jellyfin` (your own Jellyfin server via its official API — a real TV-episode playback path, with server-side transcoding fallback and credential-free same-origin relays).
3. **Health monitoring:** a scheduled, persisted source-health sweep wired into the deployment scheduler and a private admin endpoint.
4. **Transcoding pipeline:** FFmpeg HLS-ladder + MP4-fallback + poster generation for owned files, with idempotent registration into the media library (CLI + Docker tool service).
5. **Cleanup & CI:** removed dead, insecure legacy Python code (including a fake auth handler); pointed all 8 CI workflows and the deploy docs at the current branch.

**Validation after changes: 86 tests / 15 files passed** (was 63/11), ESLint clean, TypeScript clean, production build passed, plus a real-HTTP Jellyfin integration smoke and transcode/register CLI smokes.

**Launch recommendation (unchanged in spirit, improved in scope):** a staged launch is ready to execute once you supply the TMDB token and a server. Movies via the verified scraper + your own library; **TV is now launchable if you point it at your own Jellyfin library or per-episode owned media** — verify against your real library first. Do not advertise "every movie, every show, all sources": coverage is the union of configured sources, and upstream sites change without notice.

### Explicit boundary

You asked for integrations that extract protected streams by **bypassing third-party access controls, DRM or authentication. That will not be built** — it is circumvention, it breaks the platforms' terms regardless of redistribution licenses, and it creates takedown/security liability for the product. Everything in this repo stays on the legitimate side of that line, and the architecture does not need the bypass to function:

- The scraper worker only observes media that a site's **public player** requests normally (no login/captcha/DRM circumvention, no key extraction — enforced in `scripts/lib/browser-media.mjs`).
- Protected/licensed platforms are integrated the way they support: **official APIs with your own credentials** (Jellyfin today; the same `ProviderAdapter` contract accepts any partner API), or **your licensed media endpoints/CDN** via the `owned-media` adapter. If a partner gives you licensed stream URLs, they drop straight into the library JSON — no code changes.

---

## 2. Repository audit findings

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | Previous engineer's entire delivery (`eca73a7`, 40+ commits: worker, relays, deployment, desktop, 63 tests) absent from `main`; working branch started from stale `main` | **Critical** | Fixed: fast-forwarded this branch to `eca73a7`; all work continues here. Merge to `main` at launch. |
| 2 | PR #1 (`a713f27`) implements a parallel owned-site resolver from the same base; superseded by the worker architecture | Medium | Flagged for closure; do not merge (conflicting lineage). |
| 3 | Dead Python modules (`bot.py`, `api_routes.py`, `stream_extractor.py` with invalid yt-dlp options, `jwt_auth.py`, `cinejoy_scraper.py`) — unused, and `api_routes.py` issued tokens for **any** password | High (if ever run) | **Removed.** Nothing referenced them; the Next.js API is the only backend. |
| 4 | CI workflows + deploy docs targeted only the old branch | High | Fixed: all 8 workflows accept this branch; docs updated. |
| 5 | No adapter for operator-owned/licensed media despite being the core commercial premise | High | **Implemented** (`owned-media`, 6 tests). |
| 6 | No TV episode playback path | **Release blocker** | **Implemented** via Jellyfin + owned-media episodes (integration-tested). Live verification against the owner's real library remains a launch gate. |
| 7 | Source health was on-demand only; dead catalogue servers were not proactively demoted | Medium | **Implemented**: persisted sweep + scheduler wiring + admin endpoint (3 tests). |
| 8 | No transcoding path for owned files (README described one; nothing existed) | Medium | **Implemented**: planner/runner/registration + Docker tool image (6 tests + CLI smoke). |
| 9 | Embedded PGlite is single-owner; horizontal scaling unsupported | Medium (documented) | Unchanged: run one web replica; PostgreSQL + job lock needed for scale-out. |
| 10 | Installers unsigned/un-notarized; no auto-updater | **Release gate** | Unchanged: owner must supply signing credentials; see §6. |
| 11 | No rate limiting/WAF, external monitoring, backup/restore drill, load test | **Release gate** | Unchanged; checklist in §6. |

Historical verification from the previous engineer (CI runs for 3-film live playback/seek, container smoke, 3-platform native packages) is recorded in `FINAL-AUDIT.md` / `DELIVERY.md` and remains valid for the code it tested — this branch contains exactly that code plus this session's additions.

---

## 3. Architecture as built

```
TMDB (metadata only: search, categories, platforms, seasons/episodes)
   │
   ▼
Catalogue sync (scheduler → POST /api/admin/catalogue, ≤12 identities/run)
   │  publishes only titles with a successful source check <24h old
   ▼
SourceResolver ── priority order, per-adapter timeout/retry/health report
   1. owned-media      your CDN/licensed endpoints (library JSON, movies+episodes)
   2. jellyfin         your Jellyfin server (official API; direct MP4 + HLS transcode)
   3. web-scrapers     private Chromium worker observes public players;
   │                   verified HLS/MP4 → opaque same-origin relay grants
   4. catalogue rows   PostgreSQL provider/source rows (Internet Archive etc.)
   5. blender          official open-movie CDN (opt-in demo catalogue)
   ▼
rankSources(): authorized provider + host allow-list + format check + health
   ▼
Shaka player: ABR, quality/audio/subtitle menus, resume, progress beacons;
on failure marks the source failed and walks to the next server automatically.

Same-origin relays (browser never sees origins/credentials):
  /api/playback/<grant>/media.*  → worker MediaGateway (scraper media)
  /api/jellyfin/<grant>/media.*  → JellyfinMediaGateway (X-Emby-Token server-side)

Health monitoring: scheduler → POST /api/admin/health → probe stalest sources
(range request, no body download) → persist online/degraded/offline → ranking.

Transcoding: scripts/transcode.mjs (FFmpeg ladder ≤ source height, VOD HLS +
faststart MP4 + poster) → upload to your storage → scripts/register-media.mjs
→ owned-media library → adapter #1. Docker: compose `transcode` tool service.
```

**Key properties**

- **Identity-bound resolution:** adapters receive TMDB IDs (+ season/episode), never free-text URLs; wrong-identity responses are rejected. Episode availability is isolated per episode.
- **Fail-closed everything:** host allow-lists (no `*`), HTTPS-only browser-facing URLs, format/MIME verification, bounded request/response sizes, worker quotas, token-gated admin routes, no secrets in installers or browser payloads.
- **Multi-server UX:** each title exposes N ranked sources ("servers") in the player; switching and automatic fallback are implemented and were native-tested.
- **In-site playback only:** no external redirects; platform pages describe catalogue membership, not Netflix/Prime integrations.

---

## 4. This session's implementation & evidence

| Component | Files | Evidence |
|---|---|---|
| Owned/licensed media adapter | `src/lib/streaming/owned-media.ts` | 6 tests: strict config validation (wildcard/host/format rejections), TMDB + slug matching, per-episode isolation, subtitle passthrough, priority ranking |
| Jellyfin adapter + relay | `src/lib/streaming/jellyfin.ts`, `src/app/api/jellyfin/[...path]/route.ts` | 8 tests: settings validation, movie/episode resolution by TMDB ID, identity rejection, missing-episode isolation, credential-free manifest rewriting, range relay, fail-closed route. **Real-HTTP smoke passed**: mock Jellyfin over TCP — movie → direct MP4 (206 range) + HLS fallback; episode → HLS; manifest/segments relayed with zero key leakage |
| Health sweep | `src/lib/streaming/health-sweep.ts`, `src/app/api/admin/health/route.ts`, `deploy/scheduler.mjs` | 3 tests: online/offline/degraded classification (404, HTML error page, network failure, allow-list violation), persistence, recovery re-check, auth gating |
| Transcode pipeline | `scripts/lib/transcode-plan.mjs`, `scripts/transcode.mjs`, `scripts/register-media.mjs`, `deploy/transcode.Dockerfile` | 6 tests: no-upscale ladder, HLS/MP4/poster command construction, ingest item validity against the app's own parser, idempotent registration. CLI smokes: `--dry-run` plan + double registration → single item |
| Resolver wiring | `src/lib/streaming/providers.ts`, `src/lib/streaming.ts` | Adapter order: owned → jellyfin → scrapers → catalogue → blender; relay-path allow-list extended; readiness reports `libraryAdapters` |
| Deployment | `deploy/compose.yml`, `deploy/library/`, `.env.example`, `deploy/README.md` | Library mount, Jellyfin env passthrough, `transcode` tool profile, scheduler health calls |
| Cleanup/CI | removed 9 legacy Python files; 8 workflows + docs retargeted | `npm run lint`, `npm run typecheck` clean after removal |

**Full suite: 86 tests / 15 files passed · ESLint clean · tsc clean · `next build` (standalone) passed.**

What this evidence is **not**: it is not a live test against your TMDB account, your Jellyfin library, your CDN, or a permanent server — those need your credentials/infrastructure and are the acceptance steps below.

---

## 5. Your launch runbook (in order)

### Step 0 — Merge the lineage
Merge `arena/22ae60e3-lumiere` into `main` (PR or fast-forward) and close PR #1 as superseded. Deploy from one branch.

### Step 1 — Credentials & server (you)
1. **TMDB Read Access Token** from https://www.themoviedb.org/settings/api (private; never commit/chat).
2. Linux x86-64 Docker host, starting point **4 vCPU / 8 GB RAM / 40 GB disk** + video-relay bandwidth; Docker Engine + Compose v2 + Node 22 + Git.
3. DNS A record → server; open **80/443 only**; never expose port 3200.

### Step 2 — Start the service
```sh
git clone --branch arena/22ae60e3-lumiere https://github.com/The-Mhood/lumiere.git
cd lumiere
node scripts/configure-deployment.mjs     # generates private deploy/.env secrets
nano deploy/.env                          # LUMIERE_DOMAIN, TMDB_READ_ACCESS_TOKEN, TMDB_WATCH_REGION=NG
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yml ps
```
Caddy provisions HTTPS automatically. The scheduler starts catalogue sync + health sweeps every 5 minutes once web is healthy.

### Step 3 — Connect your media (the coverage step)
- **Jellyfin (fastest TV path):** create an API key in Jellyfin Dashboard, set `LUMIERE_JELLYFIN_URL` + `LUMIERE_JELLYFIN_API_KEY` in `deploy/.env`, `up -d web`. Ensure library items carry TMDB IDs.
- **Own/licensed files:** `compose run --rm transcode …` → upload output to your CDN → `node scripts/register-media.mjs … --config deploy/library/owned-media.json` (mounted automatically).
- **Licensed partner endpoints:** add their HTTPS HLS/MP4 URLs + hosts to the same library JSON.
- **Additional scraper sites:** add entries to `scrapers/sites.json` (+ matching `LUMIERE_SCRAPER_PROVIDERS`), then run the live playback verification workflow before counting them as coverage. TV via scraper needs a real `episodeUrl` template that passes the same gate.

### Step 4 — Preflight
```sh
node --env-file=deploy/.env scripts/preflight-deployment.mjs https://watch.your-domain.com --require-tv
```
`--require-tv` now passes when Jellyfin or episode-capable owned media is configured. Readiness = configuration evidence, not decoding evidence.

### Step 5 — Desktop installers (Mac + Windows)
1. GitHub → Settings → Secrets and variables → Actions → **Variables**: `LUMIERE_DESKTOP_SERVER_URL=https://watch.your-domain.com` (public origin, no secrets).
2. Actions → **Desktop packages** → Run workflow → branch `arena/22ae60e3-lumiere`.
3. Artifacts: Windows x64 NSIS, macOS Intel DMG/ZIP, macOS Apple Silicon DMG/ZIP. Installers bundle a local backend and connect to your hosted service when the variable is set.
4. **Before public distribution:** Apple Developer ID signing + notarization and a Windows code-signing certificate (supply via CI secrets; current builds are unsigned/ad-hoc). Never ask users to disable OS security.

### Step 6 — Acceptance checklist (go/no-go)
- [ ] `/api/health` green over HTTPS; worker private; preflight passes.
- [ ] Real TMDB search returns expected movies **and** series with posters; platform rails match `TMDB_WATCH_REGION`.
- [ ] ≥3 ordinary movies play on the permanent host: start, seek near beginning/middle/end, forced primary-source failure falls back to the next server.
- [ ] ≥2 series × multiple episodes play (Jellyfin/owned); a missing episode reports unavailable without hiding working ones.
- [ ] Unavailable titles fail with a bounded, useful error — never a wrong film, never an infinite spinner.
- [ ] Track/quality/subtitle selection, fullscreen, resume, watchlist, login/logout work in browser **and** installed Windows/Intel/Apple-Silicon apps against the permanent server.
- [ ] Accounts/history survive restart; backup taken with web stopped and **restore rehearsed** on staging.
- [ ] Rate limiting/WAF in front (Caddy rate-limit plugin or Cloudflare), external uptime monitoring on `/api/health`, disk/bandwidth alerts.
- [ ] Latest CI green on the release commit; installers signed/notarized.

---

## 6. Remaining gaps & risks (honest list)

1. **Live verification with owner assets** — TMDB token, real Jellyfin library, real CDN, permanent host. All integration-tested; none owner-certified yet. This is the difference between "implemented" and "launched".
2. **Scraper coverage is one live-verified movie site.** More sites = more adapters + verification runs; upstream changes can break any of them at any time. The health sweep + fallback contain the blast radius but cannot create coverage.
3. **Signing/notarization + update policy** for installers (no auto-updater configured).
4. **Scale:** one web replica (embedded PGlite). For multi-replica: move to PostgreSQL (`DATABASE_URL`), add a distributed job lock for the scheduler, and put media relay behind a CDN.
5. **Abuse/ops hardening:** edge rate limiting, external monitoring, load/soak test at expected concurrency, dependency/security review, restore drills.
6. **Jellyfin direct-play heuristic** assumes H.264-in-MP4 is browser-safe; exotic profiles fall back to Jellyfin's HLS transcode — verify playback on your actual library encodes.
7. **Legal/commercial** (owner's domain, out of scope here): redistribution rights for every source you configure, platform terms for scraper sites, and store/distribution policies for the installers.

## 7. Bottom line

The architecture you asked for — TMDB-populated categories, multi-server resolution, in-site playback, browser worker, health monitoring, transcoding, fallback, owned-storage and official-API adapters, web + Mac/Windows packaging — **exists, is tested, and is deployable from this branch**. What remains is execution with your assets: merge, provision, configure, run the acceptance gates, sign the installers, and launch in stages. The one thing that will not be built is DRM/access-control circumvention; the licensed-endpoint and official-API paths above are the supported way to reach protected catalogues.
