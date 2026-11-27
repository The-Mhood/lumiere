#!/usr/bin/env node
/**
 * Transcode an operator-owned media file into a browser-ready package:
 * adaptive HLS (H.264/AAC ladder, never upscaled), progressive MP4 fallback
 * and a poster frame — then emit an owned-media library item for registration.
 *
 *   node scripts/transcode.mjs input.mkv --slug my-film --tmdb-id 27205 \
 *        --base-url https://cdn.example.com/library --out ./media-out
 *   node scripts/transcode.mjs input.mkv --slug my-show-s01e01 --tmdb-id 1396 \
 *        --kind series --season 1 --episode 1 --base-url https://cdn.example.com/library
 *
 * Requires ffmpeg + ffprobe on PATH (or run through the Compose `transcode`
 * tool service, which ships them). `--dry-run` prints the exact plan/commands
 * without executing anything. Upload the output directory to your storage so
 * that <baseUrl>/<slug>/hls/master.m3u8 resolves, then register the item:
 *   node scripts/register-media.mjs media-out/<slug>/ingest.json
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildHlsArgs, buildIngestItem, buildMp4Args, buildPosterArgs, selectRungs } from './lib/transcode-plan.mjs';

function parseArgs(argv) {
  const options = { kind: 'movie', out: './media-out', hasMp4: true, dryRun: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { const value = argv[++i]; if (value === undefined) throw new Error(`Missing value for ${arg}`); return value; };
    if (arg === '--slug') options.slug = next();
    else if (arg === '--tmdb-id') options.tmdbId = Number(next());
    else if (arg === '--kind') options.kind = next();
    else if (arg === '--season') options.seasonNumber = Number(next());
    else if (arg === '--episode') options.episodeNumber = Number(next());
    else if (arg === '--base-url') options.baseUrl = next();
    else if (arg === '--out') options.out = next();
    else if (arg === '--no-mp4') options.hasMp4 = false;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1) throw new Error('Usage: transcode.mjs <input> --slug <slug> --base-url <https origin> [--tmdb-id N] [--kind series --season N --episode N] [--out dir] [--no-mp4] [--dry-run]');
  options.input = positional[0];
  if (!options.slug) throw new Error('--slug is required');
  if (!options.baseUrl) throw new Error('--base-url is required (where the output will be hosted)');
  if (!['movie', 'series'].includes(options.kind)) throw new Error('--kind must be movie or series');
  return options;
}

function probe(input) {
  const video = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', input], { encoding: 'utf8' });
  if (video.status !== 0) throw new Error(`ffprobe could not read ${input}: is FFmpeg installed and the file valid?`);
  const stream = JSON.parse(video.stdout).streams?.[0];
  if (!stream?.height) throw new Error('No video stream found in input');
  const audio = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'json', input], { encoding: 'utf8' });
  const hasAudio = audio.status === 0 && Boolean(JSON.parse(audio.stdout).streams?.length);
  return { width: stream.width, height: stream.height, hasAudio };
}

function run(tool, args, dryRun) {
  console.log(`$ ${tool} ${args.map(a => (/[\s"'[\];]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  if (dryRun) return;
  const result = spawnSync(tool, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${tool} exited with status ${result.status}`);
}

const options = parseArgs(process.argv.slice(2));
const info = options.dryRun && process.env.TRANSCODE_ASSUME_HEIGHT
  ? { width: 0, height: Number(process.env.TRANSCODE_ASSUME_HEIGHT), hasAudio: true }
  : probe(options.input);
const rungs = selectRungs(info.height);
const target = path.join(options.out, options.slug);
const hlsDir = path.join(target, 'hls');
console.log(JSON.stringify({ input: options.input, source: info, rungs: rungs.map(r => `${r.height}p@${r.videoKbps}k`), output: target, dryRun: options.dryRun }));
if (!options.dryRun) await mkdir(hlsDir, { recursive: true });
run('ffmpeg', buildPosterArgs({ input: options.input, output: path.join(target, 'poster.jpg') }), options.dryRun);
run('ffmpeg', buildHlsArgs({ input: options.input, outDir: hlsDir, rungs, hasAudio: info.hasAudio }), options.dryRun);
if (options.hasMp4) run('ffmpeg', buildMp4Args({ input: options.input, output: path.join(target, 'fallback.mp4'), hasAudio: info.hasAudio }), options.dryRun);
const item = buildIngestItem({ slug: options.slug, tmdbId: options.tmdbId, kind: options.kind, seasonNumber: options.seasonNumber, episodeNumber: options.episodeNumber, baseUrl: options.baseUrl, rungs, hasMp4: options.hasMp4 });
if (!options.dryRun) {
  await writeFile(path.join(target, 'ingest.json'), JSON.stringify(item, null, 2) + '\n');
  console.log(`\nDone. Next steps:\n  1. Upload ${target}/ so ${options.baseUrl.replace(/\/+$/, '')}/${options.slug}/hls/master.m3u8 is reachable.\n  2. node scripts/register-media.mjs ${path.join(target, 'ingest.json')}\n  3. Restart/reload the app; the title resolves from your library first.`);
} else {
  console.log('\nDry run only. Library item that would be written:\n' + JSON.stringify(item, null, 2));
}
