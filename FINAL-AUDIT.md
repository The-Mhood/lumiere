# Lumière — final audit and launch plan

## Executive answer

**Hosting plus your TMDB token activates the implemented discovery and source-checking pipeline; it does not make every movie or TV episode playable.**

With the supplied Compose deployment running:

1. TMDB provides matching search results, posters, genres and regional platform membership.
2. A scheduler progressively checks platform/trending titles, up to 12 fresh identities per run. It rotates movie/TV metadata, platforms and a bounded set of provider pages; this is not a complete import of TMDB.
3. Public browsing shows titles with a successful source lookup within 24 hours. Search may show metadata-only matches, explicitly described as requiring source lookup.
4. Selecting a title resolves its identity through configured adapters and passes eligible media to Lumière's player. Available sources are ranked and player fallback/retry is implemented.
5. A desktop build configured with your permanent HTTPS origin uses the same hosted service, accounts and catalogue.

**Current verdict: functional, verified movie playback for demonstrated titles; NOT a finished universal movie/TV service.** One public movie-site scraper is live-verified. No TV episode source template is configured or verified. A valid TMDB credential and a permanent server cannot close those adapter gaps by themselves.

## Intended product versus current implementation

| Requirement | Current implementation | Acceptance status |
|---|---|---|
| Movie/TV search matching entered text | TMDB movie/TV search; people results excluded; movie/series identities kept separate | Implemented and mocked integration-tested; real owner credential still needed |
| Posters, genres and platform catalogues | TMDB metadata and regional Netflix/Prime/HBO/etc. discovery | Implemented; not live-certified with owner credential |
| Automatic category population | Recurring bounded metadata/source sync; successful lookups publish browsing entries | Implemented; not complete TMDB coverage and not every category will have a source |
| No sample films in production UI | Default demo seeding disabled; demo records excluded from browsing, routes and library/history cards | Implemented; existing data preserved rather than deleted |
| Play selected films inside Lumière | Identity-bound browser worker and opaque same-origin media relay | Demonstrated with actual movie playback/seek, not universal coverage |
| Multiple independent sites for arbitrary films | Modular adapters, priorities, failure isolation, host checks and fallback | Architecture exists; only one real movie-site scraper live-verified |
| TV seasons/episodes | Real TMDB series, season and episode ingestion, episode selection and navigation | Metadata/navigation implemented; media source missing |
| TV playback | Resolver carries season/episode identities; per-episode availability now isolated | NOT live-verified; release blocker for a TV offering |
| Player functions | Shaka MP4/HLS/DASH, controls, retries/fallback, track choices, fullscreen, progress | Existing tests/previous native gates cover demonstrated paths; format/track availability depends on actual media |
| Accounts, watchlists and history | Existing application features and persistent database | Regression-tested; permanent-host cross-device/manual acceptance remains |
| Permanent website/worker | Docker web + Chromium worker, private network, persistent storage, Caddy HTTPS, scheduler | Images and web-container smoke tested; actual server/domain not provisioned |
| Windows/macOS apps | Installers bundle backend; optional public HTTPS service origin; sandboxed renderer | All three platforms passed at the pre-audit base; latest audit-specific rerun pending |
| Trusted public installers | macOS signing/notarization and Windows signing | NOT configured/certified |
| Every film from every source | No implementation can guarantee upstream availability or future site stability | NOT satisfied; must not be advertised |

Platform names describe catalogue membership, **not** a direct Netflix/Prime/HBO video integration. No authentication/DRM/paywall bypass is implemented.

## Audit fixes delivered

- Added per-episode playback-check persistence. Failure of one episode no longer overwrites another successful episode's availability. Cross-title episode writes are rejected.
- Limited the “Latest episodes” rail to recently successful episode lookups rather than promoting all episode metadata after a single series-level success.
- Rejected invalid selected episode IDs instead of silently playing the first episode.
- Allowed recent source-checked titles to populate the hero even without a manually assigned featured flag, and removed the four-genre rail cap.
- Corrected episode UI wording: unchecked episode metadata is not proof that an episode is unavailable.
- Added authenticated `/api/admin/readiness` and `scripts/preflight-deployment.mjs`. These test server-side metadata access, worker health and matching app/worker adapter capabilities without returning secrets.
- Made the legacy aggregation mutation fail closed when the production admin token is missing; malformed limits are normalized.
- Changed native smoke navigation to wait for DOM readiness instead of every external resource. Intel Mac CI uses software rendering because an observed runner failure reported EGL initialization errors; shipped apps retain GPU acceleration. This is a mitigation, not a claim that all Intel playback problems are solved.

## Evidence and limitations

### Local checks

- **63 tests / 11 files passed**, including matching movie/TV search, idempotent real episode metadata, private readiness access, adapter parity and episode ownership/availability regression checks.
- TypeScript, ESLint and standalone production build passed after audit changes.
- Most credential-dependent checks are mocked integration tests; they are not live TMDB account tests.

### Live/CI evidence

- [Actual hosted app playback run 46028227442](https://github.com/The-Mhood/lumiere/actions/runs/46028227442): Godfather playback and seek gate passed at the pre-audit base. The gate requires video playback beyond two seconds, duration over 10,000 seconds and continued playback after seeking to two minutes. It does not watch the entire film.
- [Independent movie scraper/player run 46030036575](https://github.com/The-Mhood/lumiere/actions/runs/46030036575): passed on the audit implementation. Separate from permanent-host acceptance.
- [Production container run 46027615252](https://github.com/The-Mhood/lumiere/actions/runs/46027615252): web/worker images built and web health, platform page and no-demo search checks passed.
- [Native base run 46028227069](https://github.com/The-Mhood/lumiere/actions/runs/46028227069): Windows x64, macOS Intel and Apple Silicon all passed. These use isolated fixture data, not the owner's future hosted service.
- Audit reruns: **container build/smoke and actual-preview playback/seek passed**; native audit rerun still in progress at report time. [containers 46030071551](https://github.com/The-Mhood/lumiere/actions/runs/46030071551), [actual preview 46030075978](https://github.com/The-Mhood/lumiere/actions/runs/46030075978), [native packages 46030036354](https://github.com/The-Mhood/lumiere/actions/runs/46030036354). Do not infer success from an in-progress run; consult its final checks.

Temporary GitHub-runner/Cloudflare previews expire after approximately three hours or sooner on cancellation/failure. They are not production hosting or an availability commitment.

## What YOU must configure

### 1. Metadata credential

Obtain a **TMDB API Read Access Token** at https://www.themoviedb.org/settings/api. Keep it private. Do not paste it into chat, commit it, put it in browser code or include it in installers.

### 2. Permanent server and domain

Use a Linux x86-64 Docker host with outbound access to configured sites. A starting recommendation is 4 vCPU, 8 GB RAM and 40 GB disk, plus adequate video-relay bandwidth; this is not load-tested capacity. Point your domain's DNS to it and open 80/443; restrict administration access. The scraper must remain private on the Compose network.

### 3. Start the services

On the server, with Git, Node 22, Docker Engine and Compose v2 installed:

```sh
git clone --branch arena/e423f162-lumiere https://github.com/The-Mhood/lumiere.git
cd lumiere
node scripts/configure-deployment.mjs
# Edit deploy/.env using a secure editor:
# LUMIERE_DOMAIN=watch.your-domain.com
# TMDB_READ_ACCESS_TOKEN=your-private-token
# TMDB_WATCH_REGION=NG (or your supported market)
# Preserve the three generated random service secrets.
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yml ps
```

No `LUMIERE_REMOTE_APP_URL` or temporary tunnel endpoint belongs in the permanent server configuration. The scheduler starts automatically once the app is healthy. See [deploy/README.md](deploy/README.md) for logs, data persistence and updates.

### 4. Run configuration preflight

From a trusted administration machine with the private deployment file:

```sh
node --env-file=deploy/.env scripts/preflight-deployment.mjs https://watch.your-domain.com
```

The output distinguishes `movieLookupReady` from `tvLookupReady`. Add `--require-tv` if TV support is a launch requirement; with today's adapter list this should fail rather than falsely certify TV. A readiness pass is configuration evidence, not video decoding evidence.

### 5. Connect and build desktop apps

In GitHub repository **Settings → Secrets and variables → Actions → Variables**, set:

`LUMIERE_DESKTOP_SERVER_URL=https://watch.your-domain.com`

Then dispatch **Desktop packages** on `arena/e423f162-lumiere`. Download Windows x64, macOS Intel and macOS Apple Silicon artifacts. The public URL is baked into the installer; provider secrets are not. Without it, the installer uses its bundled local backend and does not magically connect to the hosted catalogue.

Provide signing/notarization credentials through secure release tooling before broad public distribution. Do not ask customers to disable OS security protections.

## Remaining DEVELOPMENT work — not solved by your setup

1. Implement and independently verify additional real source adapters. A site declaration or generic URL template is not sufficient evidence. Each needs exact title/year or episode matching, bounded requests, approved host lists and actual player tests.
2. Add and verify a real TV episode source adapter. Test at least two shows and multiple seasons/episodes, including missing episodes and source failure. Real episode metadata alone is insufficient.
3. Certify permanent-service playback inside all installed apps; current native fixture checks are not a substitute.
4. Complete operational hardening for the intended audience/load: abuse/rate controls, monitoring, restart/recovery, backup/restore exercises, dependency/security review and bandwidth capacity tests. Embedded PGlite is single-owner: use one web replica; horizontal scaling additionally needs PostgreSQL and a distributed job lock.
5. Complete signing/notarization and release distribution/update policy. No automatic installer update service is certified.

There are other catalogue/official-source modules in the repository, but their presence must not be counted as universal movie coverage or multiple independently verified commercial-film scrapers.

## Launch acceptance checklist

Do not label this a finished movie-and-TV product until the relevant gates pass:

- [ ] HTTPS domain and database health pass; private worker is not exposed publicly.
- [ ] Real TMDB search returns expected movie and series identities/posters.
- [ ] Platform membership matches the chosen region; unrelated films never appear as fallback platform results.
- [ ] Multiple ordinary movies play on the permanent host, seek near the beginning/middle/end, and recover from a failed primary source.
- [ ] A sample of unavailable titles reports a bounded, useful error rather than spinning indefinitely or playing a different film.
- [ ] TV adapters pass identity/season/episode playback tests; failed episodes do not hide working ones.
- [ ] Track selection, fullscreen, resume position, watchlist and login/logout work in browsers and installed Windows/Intel Mac/Apple Silicon apps.
- [ ] Accounts/history survive service restart and a tested backup/restore.
- [ ] Latest native/container/live-media checks pass on the release commit, and required installers are signed/notarized.

**Release recommendation:** stage the demonstrated movie-only scope after owner setup and permanent-host acceptance. Do not launch a universal TV/all-source promise. Those are still development gaps, not token or hosting switches.
