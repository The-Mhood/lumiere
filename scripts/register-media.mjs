#!/usr/bin/env node
/**
 * Register transcoded/licensed media into the owned-media library config used
 * by the app's OwnedMediaProvider (LUMIERE_OWNED_MEDIA_FILE).
 *
 *   node scripts/register-media.mjs media-out/my-film/ingest.json [--config deploy/library/owned-media.json]
 *
 * Idempotent: re-registering the same identity (tmdbId/slug + kind + episode)
 * replaces its sources instead of duplicating them. The host of each source
 * URL is added to the library's explicit allow-list.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export function mergeOwnedMediaItem(config, item) {
  if (!item || !Array.isArray(item.sources) || !item.sources.length) throw new Error('Library item needs sources');
  if (!['movie', 'series'].includes(item.kind)) throw new Error('Library item kind must be movie or series');
  if (item.tmdbId === undefined && item.slug === undefined) throw new Error('Library item needs tmdbId or slug');
  if (item.kind === 'series' && (!Number.isInteger(item.seasonNumber) || !Number.isInteger(item.episodeNumber))) throw new Error('Series library items need seasonNumber and episodeNumber');
  const next = {
    provider: config.provider ?? { id: 'owned-media', name: 'Lumière Library', priority: 5 },
    allowedHosts: [...(config.allowedHosts ?? [])],
    items: [...(config.items ?? [])],
  };
  for (const source of item.sources) {
    const url = new URL(source.url);
    if (url.protocol !== 'https:') throw new Error('Library sources must be HTTPS');
    if (!next.allowedHosts.includes(url.hostname)) next.allowedHosts.push(url.hostname);
  }
  const sameIdentity = (other) => other.kind === item.kind &&
    (item.tmdbId !== undefined ? other.tmdbId === item.tmdbId : other.slug === item.slug) &&
    (item.kind !== 'series' || (other.seasonNumber === item.seasonNumber && other.episodeNumber === item.episodeNumber));
  const index = next.items.findIndex(sameIdentity);
  if (index >= 0) next.items[index] = item; else next.items.push(item);
  return next;
}

async function main() {
  const args = process.argv.slice(2);
  const configFlag = args.indexOf('--config');
  const configPath = configFlag >= 0 ? args[configFlag + 1] : 'deploy/library/owned-media.json';
  const inputs = args.filter((arg, i) => !arg.startsWith('--') && i !== configFlag + 1);
  if (!inputs.length) throw new Error('Usage: register-media.mjs <ingest.json ...> [--config deploy/library/owned-media.json]');
  let config = { provider: { id: 'owned-media', name: 'Lumière Library', priority: 5 }, allowedHosts: [], items: [] };
  try { config = JSON.parse(await readFile(configPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const input of inputs) {
    const item = JSON.parse(await readFile(input, 'utf8'));
    config = mergeOwnedMediaItem(config, item);
    console.log(`Registered ${item.kind} ${item.tmdbId ?? item.slug}${item.kind === 'series' ? ` S${item.seasonNumber}E${item.episodeNumber}` : ''} (${item.sources.length} sources)`);
  }
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`Library written to ${configPath}. Point LUMIERE_OWNED_MEDIA_FILE at it (Compose mounts deploy/library at /library).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}
