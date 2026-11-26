# Lumière implementation delivery — 2026-11-26

## Verified checkpoint

Application source: `9cc202a` on `arena/e423f162-lumiere` (later documentation-only commits do not change these binaries).

Native verification: https://github.com/The-Mhood/lumiere/actions/runs/45895665726

- **Windows x64: PASS.** NSIS installer built. Packaged executable launched its own bundled backend. Automated checks passed search, movie/series detail pages, device settings, restart persistence, forced primary-source failure followed by live fallback playback, pause, seek, and media fullscreen dimensions.
- Windows test installer artifact: https://github.com/The-Mhood/lumiere/actions/runs/45895665726/artifacts/15153945911
- **macOS Intel: FAIL at launch.** DMG and ZIP built, but executable exits with `SIGTRAP` before Electron's ready event. macOS ARM builds in earlier runs failed at the same startup stage. Do not distribute the macOS builds as working applications.
- macOS failed job: https://github.com/The-Mhood/lumiere/actions/runs/45895665726/job/140168802878
- Local production server build, TypeScript, ESLint and **21 tests pass**. Production dependency audit reports **zero known vulnerabilities**. Development/build tooling still has moderate audit findings; those are not a clean full-tree audit.

The Windows test launched the packaged executable, not the NSIS installation flow. Signing, real installation/upgrade, and OS security-prompt behavior still require release testing.

## Implemented

- Fixed broken search imports, search suggestions, invalid paging, offline font builds and standalone configuration.
- Preserved PostgreSQL/Drizzle and added a persistent embedded PostgreSQL/PGlite mode with schema bootstrap and transactional first-boot catalogue initialization. One embedded client is shared across route bundles.
- Added provider adapter/resolver contracts, isolated provider failures, deadlines, retries, priorities, normalized sources, health reports and a source-resolution API.
- Fixed same-source retry, stale adaptive-player callbacks, bounded loading, source-switch position preservation, external adaptive subtitles and next-episode progression.
- Added persistent device preferences and a settings screen; retained account watchlist/progress flows.
- Added original typographic catalogue covers and a desktop icon.
- Added Electron startup/server lifecycle, loopback-only backend, per-install secret/data storage, stable storage origin, window persistence, navigation/popup restrictions, native build scripts and CI smoke/live-media tests.
- Patched Next.js security advisories; stopped tracking the development `.env` and rejected insecure production signing-key defaults.

## Remaining release blockers

1. **macOS startup:** `SIGTRAP` before `app.whenReady()` resolves, on both tested processor architectures. Ad-hoc signing, explicit JIT/library entitlements, disabling hardware acceleration, multiple macOS runner versions and removing the native singleton broker did not resolve it. Native crash capture did not yield an actionable report. Last desktop diagnostic records main-process startup and acquisition of the filesystem instance lock, but never records `Electron ready`.
2. **Catalogue content correctness:** original fixtures attached unrelated films/trailers to several titles and every Caminandes episode. These are now rejected, not represented as working sources. Matching movie mappings remain for Big Buck Bunny, Sintel, Tears of Steel and Elephants Dream. Other curated titles/episodes need actual matching sources. Episode selection/navigation and autoplay code are present, but real TV playback/progression is not acceptance-tested.
3. **Playback coverage:** live Windows fallback playback/control/fullscreen checks passed. Subtitle display, audio/quality switching, all formats/endpoints and recovery during long playback still need complete end-to-end coverage.
4. **Public release:** Windows is unsigned; macOS builds are ad-hoc signed for CI, not Developer-ID signed/notarized. No automatic update service is configured. Installer installation/upgrade needs target-machine validation.

This is **not a completed production-ready cross-platform release**. The working Windows test build and implemented platform infrastructure are delivered; the macOS launch failure and remaining gates above remain open.

## Running / building

See `README.md` and `.env.example`. `npm run dev -- --hostname 0.0.0.0` starts development without an external DB. `npm run desktop:prepare` creates the standalone server. Native build commands are `npm run desktop:win` and `npm run desktop:mac`; native CI contains the explicit ad-hoc macOS test signing flags. User data is outside the installed app; never bundle a development database or `.env`.
