# Launch Lumière on a persistent server

This is the deployment procedure, not a claim that a server has already been
purchased/provisioned. A Docker host with outbound access to metadata and media
sites is required. Hosting does **not** unlock every streaming service.

## What you need to do

1. Obtain a **TMDB API Read Access Token** in your own TMDB account's API settings
   at https://www.themoviedb.org/settings/api. Keep it private. You do not need to
   paste it into chat or put it in GitHub source code.
2. Provision a Linux x86-64 server with Docker Engine + Compose v2. Start with
   **4 vCPU / 8 GB RAM / 40 GB disk** for the app, embedded database and browser
   worker; actual capacity depends on concurrent video streams. This is a starting
   recommendation, not a load-tested capacity guarantee. DigitalOcean, Hetzner,
   AWS or another Docker host can run it. The server needs outbound HTTPS access
   to the configured sources and enough paid bandwidth for video relay.
3. Point a domain's DNS A record at that server. Open inbound **80/443 only**;
   restrict SSH to your administration IP. Do not publish port 3200.
4. On the server:

   ```sh
   git clone --branch arena/22ae60e3-lumiere https://github.com/The-Mhood/lumiere.git
   cd lumiere
   node scripts/configure-deployment.mjs
   nano deploy/.env
   ```

   Set `LUMIERE_DOMAIN=watch.your-domain.com` (hostname only),
   `TMDB_READ_ACCESS_TOKEN=...`, and your `TMDB_WATCH_REGION`, e.g. `NG` or `US`.
   Leave the three generated random secrets in place. Never commit this file.
   The configure command needs Node 22 locally; alternatively create the file
   yourself with the same keys using a cryptographically secure secret generator.
5. Start services:

   ```sh
   docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
   docker compose --env-file deploy/.env -f deploy/compose.yml ps
   docker compose --env-file deploy/.env -f deploy/compose.yml logs --tail=100 web worker scheduler
   ```

   Caddy requests/renews HTTPS certificates. The worker is accessible only on the
   private Compose network; no shared worker token reaches the browser. The app
   relays video through its own origin. User accounts/history/catalogue persist
   in the `app-data` Docker volume. Do not use `down -v` on production.
6. Open `https://watch.your-domain.com/api/health` (must return `{"ok":true}`),
   then search for a real movie. Search returns matching movie/TV metadata;
   selecting a result performs an on-demand source lookup. Matching metadata is
   **not** a guarantee the media exists on a configured source.

## Category population

The scheduler starts a bounded sync every five minutes. Each run rotates through
Netflix/Prime/HBO/etc., movie and TV metadata, and up to five provider-result
pages, checking up to 12 fresh identities per run. Successful source checks enter
the public home/category catalogue; failed/unsupported titles do not. Genre
associations come from TMDB. Checks expire after 24 hours, so stale availability
is not advertised forever. This progressively populates supported categories.
TV episodes become playable when a TV-capable adapter covers them: your Jellyfin
library or per-episode owned-media entries (below), or a scraper site configured
with an `episodeUrl` template that passes real playback verification.

Status/trigger routes are private:

- `GET /api/admin/catalogue` — progress/error counts.
- `POST /api/admin/catalogue` — start one run (202); repeated requests do not
  launch overlapping jobs in the same app process.

Both require `Authorization: Bearer <AGGREGATOR_TOKEN>`. Use a secrets-aware HTTP
client; avoid recording tokens in shell history. Run a **single web replica**
with the embedded database. Multiple replicas require shared PostgreSQL plus a
distributed job lock; this configuration does not implement the latter.

## Your own media library (owned/licensed endpoints)

The `owned-media` adapter plays media you control or are licensed to serve:
your object storage/CDN (S3, R2, GCS, nginx…), licensed partner HLS/DASH/MP4
endpoints, or the output of the transcoding pipeline. It resolves ahead of all
other adapters and supports both movies and individual TV episodes.

1. Transcode a source file you own into a browser-ready package (FFmpeg needed
   locally, or use the bundled tool container):

   ```sh
   # on the server, from the repo root:
   docker compose --env-file deploy/.env -f deploy/compose.yml run --rm transcode \
     /media/my-film.mkv --slug my-film --tmdb-id 27205 \
     --base-url https://cdn.your-domain.com/library --out /media/out
   # TV episode:
   #   ... /media/show-s01e02.mkv --slug show-s01e02 --tmdb-id 1396 \
   #       --kind series --season 1 --episode 2 --base-url https://cdn.your-domain.com/library
   ```

2. Upload `deploy/media/out/<slug>/` to your storage so
   `<base-url>/<slug>/hls/master.m3u8` is publicly reachable over HTTPS.
3. Register the item into the library config (idempotent):

   ```sh
   node scripts/register-media.mjs deploy/media/out/my-film/ingest.json \
     --config deploy/library/owned-media.json
   ```

Compose mounts `deploy/library/` read-only at `/library` and the app reads
`/library/owned-media.json` automatically (re-read within 30 s; no restart
needed). `deploy/library/owned-media.example.json` shows the full schema,
including subtitles and per-episode entries. Hosts must be explicitly listed
in `allowedHosts`; wildcards like `*.r2.dev` are allowed, `*` is not.

## Your own Jellyfin server (movies + TV episodes)

If you run a [Jellyfin](https://jellyfin.org) server with your licensed library,
Lumière integrates through its official API — this is the fastest path to real
TV episode playback, because Jellyfin matches items by TMDB ID and transcodes
non-browser formats itself.

1. In Jellyfin: **Dashboard → API Keys → create a key**. Ensure your library
   items have TMDB provider IDs (the default metadata providers do this).
2. Add to `deploy/.env`:

   ```sh
   LUMIERE_JELLYFIN_URL=https://jellyfin.your-domain.com
   LUMIERE_JELLYFIN_API_KEY=your-key
   # LUMIERE_JELLYFIN_ALLOW_HTTP=1   # only for a trusted LAN server
   ```

3. `docker compose --env-file deploy/.env -f deploy/compose.yml up -d web`.

The API key never reaches the browser: media flows through opaque same-origin
grants (`/api/jellyfin/...`), HLS manifests are rewritten credential-free, and
byte-range seeking is relayed. Movies resolve to direct MP4 (when the file is
already browser-compatible) plus an HLS transcode fallback; episodes resolve
per season/episode, so one missing episode never hides another.

## Source-health monitoring

The scheduler also calls the private `POST /api/admin/health` each cycle. It
probes the least-recently-checked catalogue sources with a 2-byte range request
and persists `online/degraded/offline`, so dead servers sink in the ranking for
every viewer and recovered servers rise again. `GET /api/admin/health` reports
the last sweep plus live worker health. Same `AGGREGATOR_TOKEN` as above.

## Windows and macOS installers

In GitHub → repository **Settings → Secrets and variables → Actions → Variables**,
set `LUMIERE_DESKTOP_SERVER_URL` to your permanent HTTPS origin (no path/query).
It is a public URL, not a secret. Then run **Actions → Desktop packages → Run
workflow**, choosing branch `arena/22ae60e3-lumiere`.

Download artifacts for Windows x64, macOS Intel, and macOS Apple Silicon.
Installers include the local backend and, when this variable is set, connect the
sandboxed app window directly to your deployed website. Accounts/history are
then shared with the website. No TMDB or worker secret is embedded in installers.
Native fixture regression tests still deliberately run against isolated local
sample data; that does not certify the permanent service or TV adapter. Test an
actual installed app against your permanent server before public release.

Apple Developer signing/notarization and Windows code-signing certificates are
still required for a trusted public release. Existing builds are unsigned/ad-hoc;
do not instruct end users to disable OS security checks.

## Updates, backups, limits

- Back up the persistent database volume **with the web service stopped** (PGlite
  is single-owner). Test restoring that backup on a staging server. Back up
  `deploy/.env` separately in a secrets manager; protect database backups as PII.
- Update using `git pull --ff-only origin arena/22ae60e3-lumiere`, then run the
  Compose build/up command again. Database bootstrap is additive, not a reset.
- There is currently **one live-verified movie-site scraper**, configured in
  `scrapers/sites.json`. Additional sites need real tested adapters, matching
  media-host allowlists in the app, and per-title playback/seek validation.
- TV playback now has two integration-tested paths (your Jellyfin library and
  per-episode owned media). Verify them against YOUR real library before
  advertising TV; no scraper site has a verified `episodeUrl` template yet.
  No DRM/login/paywall bypass is implemented or planned.
- Basic authentication and worker quotas exist; CDN/WAF abuse controls, external
  monitoring, load/soak testing, dependency review, and disaster-recovery testing
  are still production launch gates. This is not a completed production audit.

## Automated preflight (after starting production)

From your administration machine with Node 22 and the private deployment file:

```sh
node --env-file=deploy/.env scripts/preflight-deployment.mjs https://watch.your-domain.com
```

This checks the website database, server-side TMDB credential, private worker,
and matching app/worker adapters. Add `--require-tv` to make missing TV support a
failure. A passing configuration check is **not** a video-decoding test. Afterward
perform the browser/installed-app acceptance steps in `FINAL-AUDIT.md`.
