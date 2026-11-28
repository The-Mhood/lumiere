# Provider integration contract

This document describes the provider boundary used by Lumière. Provider implementations are intentionally replaceable: catalogue discovery, title identity, source validation, and playback do not depend on a particular upstream service.

## Current real-media paths

1. **Internet Archive** — the `internet-archive` aggregator imports long-form catalogue entries and direct MP4 files from the Archive's public metadata/download APIs. Run `npm run aggregate -- internet-archive 40` after configuring the database. Imported items are visible only after a successful playback-source check.
2. **Operator-owned media** — `LUMIERE_OWNED_MEDIA_FILE` or `LUMIERE_OWNED_MEDIA` registers HTTPS HLS, DASH, or MP4 assets that the operator controls or is licensed to serve.
3. **Jellyfin** — the official Jellyfin API resolves movies and individual TV episodes from an operator-managed library. Credentials stay server-side; playback uses same-origin relay grants.
4. **TMDB discovery** — live search returns real movie/series metadata. Metadata is not represented as playable media; opening a title performs a separate source lookup.

The Cinejoy browser worker is an optional experimental adapter. Its current upstream playback endpoint has not been verified as healthy; it must not be treated as a working source merely because its catalogue page responds.

## Extension slot for senior engineering

Add approved partner integrations in `src/lib/streaming/provider-extensions.ts`. The exported `providerExtensions` array is intentionally empty in this demonstration build. Add an implementation there once the senior team supplies the approved provider protocol and credentials. No player or catalogue rewrite should be required.

Implement the existing `ProviderAdapter` contract from `resolver.ts`:

- `id`: stable, unique provider identifier.
- `priority`: lower values are preferred.
- `search(query, signal)`: optional in practice; return matched `TitleMatch` identities when the provider supports discovery. Return an empty array when discovery is handled by TMDB or another catalogue.
- `resolve(title, signal)`: resolve the exact movie or exact season/episode identity into zero or more `SourceRecord` objects.
- Honour `AbortSignal`, impose bounded network timeouts, and never return a source for a different title or episode.

Each `SourceRecord` must declare:

- a stable or request-scoped `id`, human-readable `label`, and direct media `url`;
- `format`: `hls`, `dash`, or `mp4`;
- `resolutions`, `audioLanguages`, `subtitleLanguages`, and `subtitles` when known;
- `status` and source `priority`;
- a provider object with `authorized: true` only after the integration is approved, and a narrow explicit `allowedHosts` list.

The shared resolver rejects non-HTTPS URLs, unauthorized providers, hosts outside the allow-list, contradictory formats, and offline sources. Extensionless media URLs require server-side format verification (`formatVerified: true`). Never persist expiring or signed playback URLs in the catalogue; resolve them on demand and keep credentials server-side.

## Protected-provider integration placeholder

The extension slot is the only intended insertion point for a future provider whose approved integration is supplied by the senior engineering team. This repository deliberately contains no DRM circumvention, decryption, key extraction, license challenge manipulation, or access-control bypass implementation. The senior team can implement its approved integration behind `ProviderAdapter`, then remove/disable the demonstration adapters without changing `VideoPlayer`, title pages, progress tracking, or subtitle/quality controls.

## Playback capabilities already shared by all providers

- HTML5 MP4 playback and Shaka-based HLS/DASH playback.
- Source health fallback and manual source selection.
- Adaptive quality selection and audio/subtitle track selection when exposed by the stream.
- External subtitle tracks supplied by a provider.
- Resume position and periodic watch-progress persistence for signed-in users.
- Per-episode source resolution and previous/next episode navigation.

A provider is not considered production-ready until real title matching, source resolution, playback, seeking, subtitles, episode selection, and failure/fallback behaviour have been exercised against its authorized service.
