# Lumière implementation delivery — 2026-11-26

## Expanded on-demand implementation checkpoint

This supersedes the earlier statement that no Cinejoy playback adapter exists.
The **implementation** now includes live TMDB movie discovery/search, provider and
genre categories, lazy persistence of clicked titles, external-identity propagation,
a multi-site browser-scraper worker interface, and a supplied Cinejoy movie adapter.
An opaque same-origin relay handles HLS manifests, relative media/key URLs, range
requests, origin-bound fetches and verified segment container/MIME normalization.
Worker credentials and cookies are never sent to the application browser.

**Live acceptance: Inception (2010), TMDB 27205 — PASS**, resolved without a catalogue
import and played by Shaka in a separate browser context through the actual Next relay
handler: https://github.com/The-Mhood/lumiere/actions/runs/45977225332 (application
checkpoint `88a0883`). Report: duration 8888.296 seconds, currentTime 2.024 seconds,
readyState 4. Earlier direct-URL/CORS/container failures are not passing results;
this run passed after their fixes.

**Three-title live playback and seeking: PASS** at `60661d3`:
https://github.com/The-Mhood/lumiere/actions/runs/45977527590.

| Movie | TMDB ID | Full-film duration reported | Playback / seek to 2 min |
| --- | --- | --- | --- |
| Inception (2010) | 27205 | 8888.296 s | PASS / PASS |
| Interstellar (2014) | 157336 | 10144.217 s | PASS / PASS |
| The Dark Knight (2008) | 155 | 9132.228 s | PASS / PASS |

All were resolved live without catalogue imports. This tests playback startup,
full-film duration and seeking, not uninterrupted end-to-end viewing of each film.
Local unit suite: **49 tests**, type checking, lint and production standalone build pass.

**Not completed:** all websites/all movies coverage; the supplied live adapter is
Cinejoy movies only. Its TV episode URL is intentionally not invented. The worker
is a separate Chromium service, not yet packaged into the native installers. The
preview sandbox has no configured TMDB credential and its outbound network cannot
reach Cinejoy directly, so the preview is not represented as an active universal
streaming deployment. See `scrapers/README.md` for deployment configuration.

The native nine-film results below are an earlier, separately verified checkpoint,
not certification of this newly added worker path across OS installations.

## Cross-platform movie acceptance: PASS

Verified application commit: `cb369255a88b7ab6597c1c4eae436c73018958c6` on `arena/e423f162-lumiere`.
Native run: https://github.com/The-Mhood/lumiere/actions/runs/45909171541 — all three jobs succeeded.

| Platform | Packaged app acceptance | Download |
| --- | --- | --- |
| Windows x64 | PASS | [NSIS installer artifact](https://github.com/The-Mhood/lumiere/actions/runs/45909171541/artifacts/15158644831) |
| macOS Apple Silicon | PASS | [DMG / ZIP artifact](https://github.com/The-Mhood/lumiere/actions/runs/45909171541/artifacts/15159134689) |
| macOS Intel | PASS | [DMG / ZIP artifact](https://github.com/The-Mhood/lumiere/actions/runs/45909171541/artifacts/15158624819) |

All **nine movies currently in the curated catalogue** started in the packaged player on each platform: Big Buck Bunny, Sintel, Tears of Steel, Elephants Dream, Cosmos Laundromat, Spring, Agent 327: Operation Barbershop, Sprite Fright, and Charge. This does not claim coverage of movies outside this catalogue or end-to-end viewing of each entire film.

Each platform also passed search, detail pages, device preferences, forced primary-source failure and fallback playback, pause, seek, media fullscreen entry/display bounds/exit, and restart persistence. Native packages include the backend and require no user-installed Node/server. These tests launch the packaged executable; they do not automate installer installation/upgrade.

The macOS pre-ready SIGTRAP was resolved with ASCII bundle/executable identity `Lumiere`, retaining the accented display name. The later media-fullscreen exit hang was resolved by separating HTML fullscreen from macOS Spaces animations and using reversible simple fullscreen. Hardware acceleration is enabled normally; `LUMIERE_DISABLE_GPU=1` is the diagnostic opt-out.

Live source range verification for all nine passed separately: https://github.com/The-Mhood/lumiere/actions/runs/45900152027. The native jobs also passed type checking and all 28 unit tests; local lint passed.

`src/lib/streaming/blender.ts` resolves official metadata, checks title/year identity and full-film duration, rejects unrelated trailers/documentaries and untrusted hosts, and normalizes public HLS/MP4/VTT sources. `blender-verified.json` provides verified stable public MP4 URLs for metadata outages, not extracted protected tokens. Title details, the detail API, and watch pages share the resolver.

## Implemented

- Fixed broken search imports, search suggestions, invalid paging, offline font builds and standalone configuration.
- Preserved PostgreSQL/Drizzle and added a persistent embedded PostgreSQL/PGlite mode with schema bootstrap and transactional first-boot catalogue initialization. One embedded client is shared across route bundles.
- Added provider adapter/resolver contracts, isolated provider failures, deadlines, retries, priorities, normalized sources, health reports and a source-resolution API.
- Fixed same-source retry, stale adaptive-player callbacks, bounded loading, source-switch position preservation, external adaptive subtitles and next-episode progression.
- Added persistent device preferences and a settings screen; retained account watchlist/progress flows.
- Added original typographic catalogue covers and a desktop icon.
- Added Electron startup/server lifecycle, loopback-only backend, per-install secret/data storage, stable storage origin, window persistence, navigation/popup restrictions, native build scripts and CI smoke/live-media tests.
- Patched Next.js security advisories; stopped tracking the development `.env` and rejected insecure production signing-key defaults.

## Remaining public-release gates

- **Signing and installation:** Windows is unsigned; macOS is CI ad-hoc signed, not Developer-ID signed/notarized. Target-machine installation, upgrade and OS security prompts require release-team testing. No automatic updater is configured.
- **Extended playback:** complete MP4/HLS/DASH endpoint coverage, subtitle rendering, audio/quality switching and long-duration recovery are not certified by these smoke tests.
- **Episodes:** real Caminandes names have adapter support, but actual episode playback/progression is not acceptance-tested. Fabricated second-season fixtures remain unavailable rather than mapped to unrelated media.
- **Editorial:** existing catalogue metadata still needs editorial review; bundled covers are original typographic artwork, not official posters.

The nine-movie cross-platform acceptance goal is met. These remaining gates mean this is still a **test release, not a signed production-ready public release**. Older reports of macOS launch failure and missing curated-movie sources are superseded by the run above.

## Running / building

See `README.md` and `.env.example`. `npm run dev -- --hostname 0.0.0.0` starts development without an external DB. `npm run desktop:prepare` creates the standalone server. Native build commands are `npm run desktop:win` and `npm run desktop:mac`; native CI contains the explicit ad-hoc macOS test signing flags. User data is outside the installed app; never bundle a development database or `.env`.

## Cinejoy integration update — catalogue only, not playback completion

The expanded scope (all-source mainstream movie playback) is **not complete**.
The legacy Python helper is not used by the application. A TypeScript Cinejoy
catalogue adapter is now registered and tested; it imports movie/series identities,
posters and external availability links, never fictitious playback URLs.

The preview database contains 128 listings imported from a real rendered Cinejoy
homepage. The homepage has a dedicated catalogue rail, and search/details work.
A repeated import updated all 128 without duplicates. Catalogue-only items carry
a LISTING badge instead of an invented playback quality.

Cinejoy's initial HTTP document is an empty SPA shell. The browser worker in
`scripts/render-catalogue.mjs` produces `catalogue-report/home.html`; import using
`npx tsx scripts/sync-external-catalogue.ts catalogue-report/home.html`.
Install its browser first with `npx playwright install chromium`.
Set `CINEJOY_RENDERED_HTML` to that rendered HTML path to enable local re-import
from the aggregators page. Re-importing the snapshot does not refresh upstream;
rerun the browser worker to obtain fresh listings. The external-catalogue workflow
verifies rendering and imports into an ephemeral database. No extracted application
keys or third-party account credentials are used.

Playback inspection found public info/server discovery at `api2.wing.st`; actual
playback invokes a separate `/g` flow alongside a WASM module. No working Lumière
adapter for that playback flow is implemented or certified. The nine official
Blender films remain the verified in-app playback coverage. The 128 listings must
not be described as 128 playable films or a completed Cinejoy integration.
