'use client';
import { useEffect, useState } from 'react';
import { VideoPlayer, type VideoPlayerProps } from './video-player';
import type { PlayableSource } from '@/lib/streaming';

export function RemotePreviewPlayer({ slug, ...props }: VideoPlayerProps & { slug?: string }) {
  const [sources, setSources] = useState<PlayableSource[] | null>(null);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/titles/${encodeURIComponent(slug)}/playback-session`, { method: 'POST', signal: controller.signal });
      const session = await response.json();
      if (!response.ok) throw new Error(session.error || 'Cannot start playback session');
      const resolved = await fetch(`${session.endpoint}/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.capability}` },
        body: JSON.stringify(session.identity), signal: controller.signal,
      });
      const data = await resolved.json();
      if (!resolved.ok) throw new Error(data.error || `Media worker returned ${resolved.status}`);
      if (data.identity?.tmdbId !== session.identity.tmdbId || data.identity?.kind !== session.identity.kind) throw new Error('Movie identity mismatch');
      const found: PlayableSource[] = [];
      for (const result of data.results || []) {
        for (const source of result.sources || []) {
          if (!['hls', 'mp4'].includes(source.format) || typeof source.playbackPath !== 'string' || !/^\/stream\/[A-Za-z0-9_-]{32}\/media\.(?:m3u8|mp4)$/.test(source.playbackPath)) continue;
          found.push({ id: -(found.length + 1), label: `${result.provider} · ${source.format.toUpperCase()}`, provider: result.provider, providerSlug: result.provider, url: `${session.endpoint}${source.playbackPath.replace('/stream/', '/media/')}`, format: source.format, resolutions: [], audioLanguages: [], subtitleLanguages: [], subtitles: [], status: 'unknown', priority: found.length });
        }
      }
      if (!found.length) throw new Error('No working source returned. Retry the lookup; provider availability can change.');
      if (!cancelled) setSources(found);
    })().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Playback lookup failed'); }).finally(() => clearTimeout(timer));
    const timer = setTimeout(() => { controller.abort(); if (!cancelled) setError('Worker did not respond in time. The temporary preview may have expired.'); }, 65000);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [slug, attempt]);
  if (!slug) return <VideoPlayer {...props} />;
  if (sources) return <VideoPlayer key={attempt} {...props} sources={sources} />;
  return <div className="grid aspect-video place-items-center rounded-xl bg-ink-800 p-6 text-center" role="status">
    <div><h2 className="font-display text-xl">{error ? 'Playback unavailable' : 'Finding movie sources'}</h2>
      <p className="mt-3 max-w-lg text-sm text-mist">{error || 'Connecting to the remote preview worker. This can take up to a minute.'}</p>
      {error && <button onClick={() => { setSources(null); setError(undefined); setAttempt(n => n + 1); }} className="mt-4 rounded-full bg-ember px-5 py-2 font-semibold text-ink">Retry playback lookup</button>}
    </div>
  </div>;
}
