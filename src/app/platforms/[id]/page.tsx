import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PLATFORMS } from '@/lib/platforms';
import { Catalogue } from '@/components/catalogue';
export const dynamic = 'force-dynamic';
export default async function PlatformPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string; page?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const platform = PLATFORMS.find(platform => String(platform.id) === id);
  if (!platform) notFound();
  const kind = sp.kind === 'series' ? 'series' : 'movie';
  return <>
    <div className="mx-auto flex max-w-7xl gap-3 px-4 pt-8 sm:px-6"><Link href="/platforms" className="mr-auto text-mist">← Platforms</Link>{(['movie', 'series'] as const).map(value => <Link key={value} href={`/platforms/${id}?kind=${value}`} className={`rounded-full px-5 py-2 text-sm ${kind === value ? 'bg-ember text-ink' : 'bg-white/5'}`}>{value === 'movie' ? 'Movies' : 'Series'}</Link>)}</div>
    <Catalogue base={`/platforms/${id}`} query={{ kind, watchProvider: platform.id, page: Number(sp.page) || 1 }} heading={platform.name} intro="Only recently source-checked titles. Select a title to play inside Lumière." />
  </>;
}
