import Link from "next/link";
import { homeRails, continueWatching } from "@/lib/content";
import { getCurrentUser } from "@/lib/auth";
import { Poster, QualityBadge, Rail, TitleCard } from "@/components/title-card";
import { HeroCarousel } from "@/components/hero-carousel";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [rails, user] = await Promise.all([homeRails(), getCurrentUser()]);
  const cw = user ? await continueWatching(user.id) : [];

  return (
    <div className="-mt-16">
      <HeroCarousel items={rails.featured} />
      {rails.discoveryNotice && <p role="status" className="mx-auto max-w-7xl px-4 py-3 text-sm text-gold">{rails.discoveryNotice}</p>}

      {cw.length > 0 && (
        <Rail title="Continue watching" href="/library" subtitle="Pick up right where you left off">
          {cw.map((row) => {
            const pct = row.progress.durationSeconds ? (row.progress.positionSeconds / row.progress.durationSeconds) * 100 : 0;
            return (
              <Link
                key={row.progress.id}
                href={`/watch/${row.title.slug}${row.episode ? `?ep=${row.episode.id}` : ""}`}
                className="group w-64 shrink-0 sm:w-72"
              >
                <div className="relative aspect-video overflow-hidden rounded-xl bg-ink-700 ring-1 ring-white/5 group-hover:ring-ember/50">
                  <Poster src={row.title.posterUrl} alt={row.title.name} className="h-full w-full opacity-70" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="truncate text-sm font-semibold">{row.title.name}</p>
                    {row.episode && (
                      <p className="truncate text-xs text-mist">
                        E{row.episode.number} · {row.episode.name}
                      </p>
                    )}
                  </div>
                  <span className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-ember text-ink">
                    <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </span>
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                    <div className="h-full bg-ember" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </Rail>
      )}

      {rails.watchProviders.length > 0 && (
        <section className="mx-auto mt-10 max-w-7xl px-4 sm:px-6">
          <h2 className="font-display text-xl font-semibold sm:text-2xl">Platforms</h2>
          <p className="mt-1 text-sm text-mist">Discover provider catalogues. Playback sources are resolved separately when you watch.</p>
          <div className="rail mt-4 gap-4">
            {rails.watchProviders.map(provider => (
              <Link key={provider.id} href={`/platforms/${provider.id}`} className="flex w-28 shrink-0 flex-col items-center gap-2 rounded-xl bg-white/5 p-4 text-center text-xs hover:bg-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {provider.logo && <img src={provider.logo} alt="" className="h-14 w-14 rounded-xl object-cover" />}
                <span>{provider.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!rails.trending.length && <section className="mx-auto max-w-7xl px-4 py-16"><h1 className="text-3xl font-bold">Your movie catalogue</h1><p className="mt-3 text-mist">No recently checked playback sources are available yet. Unverified imports and demo videos are not displayed.</p><Link href="/platforms" className="mt-5 inline-flex rounded-full bg-ember px-6 py-3 text-ink">Browse platforms</Link></section>}
      <Rail title="Trending now" href="/movies?sort=popular" subtitle="What everyone is watching this week">
        {rails.trending.map((t, i) => (
          <div key={t.id} className="relative flex items-end gap-1">
            <span className="font-display hidden select-none text-7xl font-black leading-none text-white/10 sm:block">{i + 1}</span>
            <TitleCard item={t} />
          </div>
        ))}
      </Rail>

      <Rail title="Popular movies" href="/movies">
        {rails.popular.map((t) => (
          <TitleCard key={t.id} item={t} />
        ))}
      </Rail>

      <Rail title="Latest episodes" href="/series" subtitle="Fresh from your favourite series">
        {rails.latestEpisodes.map((e) => (
          <Link key={e.id} href={`/watch/${e.title.slug}?ep=${e.id}`} className="group w-64 shrink-0 sm:w-72">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-ink-700 ring-1 ring-white/5 transition group-hover:ring-ember/50">
              <Poster src={e.stillUrl} alt={e.name} className="h-full w-full object-top opacity-80 transition group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/10 to-transparent" />
              <span className="absolute left-3 top-3 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-bold backdrop-blur">
                S{e.seasonNumber} · E{e.number}
              </span>
              <div className="absolute bottom-3 left-3 right-3">
                <p className="truncate text-sm font-semibold">{e.name}</p>
                <p className="truncate text-xs text-mist">{e.title.name}</p>
              </div>
            </div>
          </Link>
        ))}
      </Rail>

      {rails.archive.length > 0 && (
        <Rail title="Public-domain classics" href="/movies?platform=internet-archive" subtitle="Aggregated from the Internet Archive — free, full-length features">
          {rails.archive.map((t) => (
            <TitleCard key={t.id} item={t} />
          ))}
        </Rail>
      )}

      <Rail title="Recently added" href="/movies?sort=newest">
        {rails.recent.map((t) => (
          <TitleCard key={t.id} item={t} />
        ))}
      </Rail>

      <Rail title="Series to binge" href="/series">
        {rails.series.map((t) => (
          <TitleCard key={t.id} item={t} />
        ))}
      </Rail>

      <Rail title="Top rated" href="/movies?sort=rating" subtitle="Critically acclaimed picks">
        {rails.topRated.map((t) => (
          <TitleCard key={t.id} item={t} />
        ))}
      </Rail>

      {rails.collections.map((c) =>
        c.items.length ? (
          <Rail key={c.genre.id} title={c.genre.name} href={`/movies?genre=${c.genre.slug}`}>
            {c.items.map((t) => (
              <TitleCard key={t.id} item={t} />
            ))}
          </Rail>
        ) : null,
      )}

      <section className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
        <div className="grid gap-4 rounded-3xl border border-white/5 bg-gradient-to-br from-ink-700 to-ink-800 p-8 md:grid-cols-3">
          {[
            ["Up to 4K UHD", "Adaptive HLS & DASH streaming that scales to your connection, up to 2160p."],
            ["Multiple sources", "Available playback sources use automatic health-aware fallback. Catalogue-only listings are marked unavailable."],
            ["Zero ads", "No pop-ups, no redirects, no fake buttons. Just the film."],
          ].map(([h, p]) => (
            <div key={h}>
              <div className="mb-2 flex items-center gap-2">
                <QualityBadge q="2160p" />
                <h3 className="font-display text-lg font-semibold">{h}</h3>
              </div>
              <p className="text-sm text-mist">{p}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
