import Link from 'next/link';
import { PLATFORMS } from '@/lib/platforms';
import { tmdbConfigured } from '@/lib/tmdb-discovery';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Platforms' };
export default function PlatformsPage() {
  return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <p className="text-xs uppercase tracking-[0.25em] text-ember">Explore your favourites</p>
    <h1 className="mt-3 font-display text-4xl font-bold">Platforms</h1>
    <p className="mt-3 max-w-2xl text-mist">Browse movies and series by streaming platform. Available titles play here in Lumière; platform membership is metadata, not the media source.</p>
    {!tmdbConfigured() && <p role="status" className="mt-6 rounded-xl border border-gold/20 bg-gold/5 p-4 text-sm text-gold">Platform catalogues need TMDB metadata configuration. No platform memberships or playable titles have been invented.</p>}
    <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
      {PLATFORMS.map(platform => <Link href={`/platforms/${platform.id}`} key={platform.id} className="group rounded-2xl border border-white/10 bg-ink-800 p-6 transition hover:-translate-y-1 hover:border-white/30">
        <div className="flex h-24 items-center justify-center text-3xl font-black" style={{ color: platform.color }}>{platform.mark}</div>
        <h2 className="mt-4 font-semibold">{platform.name}</h2><p className="mt-1 text-xs text-mist">Movies & series <span className="float-right group-hover:text-ember">→</span></p>
      </Link>)}
    </div>
  </div>;
}
