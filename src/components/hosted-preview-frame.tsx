'use client';
import { usePathname, useSearchParams } from 'next/navigation';

export function HostedPreviewFrame({ endpoint }: { endpoint: string }) {
  const path = usePathname();
  const query = useSearchParams().toString();
  const target = `${endpoint}${path}${query ? `?${query}` : ''}`;
  return <div className="flex h-svh flex-col bg-ink">
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-2 text-xs text-mist">
      <span>Connected development preview · temporary hosted service</span>
      <a href={target} target="_blank" rel="noopener noreferrer" className="shrink-0 text-ember">Open standalone ↗</a>
    </div>
    <iframe src={target} title="Lumière connected movie app" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="min-h-0 w-full flex-1 border-0" referrerPolicy="no-referrer" />
  </div>;
}
