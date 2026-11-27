/**
 * Pure transcoding planner for operator-owned media. Produces a browser-ready
 * adaptive HLS ladder (H.264/AAC, MPEG-TS segments, VOD) plus a progressive
 * MP4 fallback and a poster frame. Execution lives in scripts/transcode.mjs;
 * keeping the plan pure makes it unit-testable without FFmpeg installed.
 */

export const LADDER = [
  { height: 2160, videoKbps: 16000, audioKbps: 192 },
  { height: 1440, videoKbps: 9000, audioKbps: 192 },
  { height: 1080, videoKbps: 6000, audioKbps: 192 },
  { height: 720, videoKbps: 3000, audioKbps: 160 },
  { height: 480, videoKbps: 1400, audioKbps: 128 },
];

/** Never upscale: keep rungs at or below the source height. A source smaller
 * than the lowest rung gets a single rung at its native height. */
export function selectRungs(sourceHeight) {
  if (!Number.isInteger(sourceHeight) || sourceHeight < 2) throw new Error('A valid source height is required');
  const rungs = LADDER.filter(rung => rung.height <= sourceHeight);
  if (rungs.length) return rungs;
  return [{ height: sourceHeight, videoKbps: Math.max(400, Math.round(sourceHeight * 2.5)), audioKbps: 96 }];
}

export function buildHlsArgs({ input, outDir, rungs, hasAudio = true }) {
  if (!rungs.length) throw new Error('At least one rendition is required');
  const n = rungs.length;
  const splits = rungs.map((_, i) => `[v${i}]`).join('');
  const scales = rungs.map((rung, i) => `[v${i}]scale=-2:${rung.height}[v${i}out]`).join(';');
  const args = ['-y', '-hide_banner', '-i', input, '-filter_complex', `[0:v:0]split=${n}${splits};${scales}`];
  rungs.forEach((rung, i) => {
    args.push('-map', `[v${i}out]`, `-c:v:${i}`, 'libx264', '-preset', 'veryfast', '-profile:v:' + i, 'high',
      `-b:v:${i}`, `${rung.videoKbps}k`, `-maxrate:v:${i}`, `${Math.round(rung.videoKbps * 1.1)}k`, `-bufsize:v:${i}`, `${rung.videoKbps * 2}k`,
      '-g', '48', '-keyint_min', '48', '-sc_threshold', '0');
    if (hasAudio) args.push('-map', '0:a:0', `-c:a:${i}`, 'aac', `-b:a:${i}`, `${rung.audioKbps}k`, '-ac', '2');
  });
  const varStreamMap = rungs.map((_, i) => hasAudio ? `v:${i},a:${i}` : `v:${i}`).join(' ');
  args.push('-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_segment_type', 'mpegts',
    '-hls_flags', 'independent_segments', '-master_pl_name', 'master.m3u8',
    '-var_stream_map', varStreamMap,
    '-hls_segment_filename', `${outDir}/v%v/seg_%05d.ts`, `${outDir}/v%v/index.m3u8`);
  return args;
}

export function buildMp4Args({ input, output, height = 720, hasAudio = true }) {
  const args = ['-y', '-hide_banner', '-i', input, '-vf', `scale=-2:'min(${height},ih)'`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p'];
  if (hasAudio) args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2');
  else args.push('-an');
  args.push('-movflags', '+faststart', output);
  return args;
}

export function buildPosterArgs({ input, output, atSecond = 10 }) {
  return ['-y', '-hide_banner', '-ss', String(Math.max(0, atSecond)), '-i', input, '-frames:v', '1', '-q:v', '3', output];
}

/** The owned-media library item describing the transcoded outputs once the
 * output directory is uploaded to the operator's storage/CDN at `baseUrl`. */
export function buildIngestItem({ slug, tmdbId, kind = 'movie', seasonNumber, episodeNumber, baseUrl, rungs, hasMp4 }) {
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) throw new Error('slug must be lowercase kebab-case');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('baseUrl must be a clean HTTPS origin');
  const prefix = `${base.href.replace(/\/+$/, '')}/${slug}`;
  const sources = [{
    url: `${prefix}/hls/master.m3u8`, format: 'hls', label: 'Library · HLS',
    resolutions: rungs.map(rung => `${rung.height}p`),
  }];
  if (hasMp4) sources.push({ url: `${prefix}/fallback.mp4`, format: 'mp4', label: 'Library · MP4', resolutions: ['720p'] });
  const item = { slug, kind, sources };
  if (tmdbId !== undefined) {
    if (!Number.isSafeInteger(tmdbId) || tmdbId < 1) throw new Error('tmdbId must be a positive integer');
    item.tmdbId = tmdbId;
  }
  if (kind === 'series') {
    if (!Number.isInteger(seasonNumber) || seasonNumber < 0 || !Number.isInteger(episodeNumber) || episodeNumber < 1) throw new Error('series items need seasonNumber and episodeNumber');
    item.seasonNumber = seasonNumber;
    item.episodeNumber = episodeNumber;
  }
  return item;
}
