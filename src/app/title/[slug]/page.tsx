import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { watchlist } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getTitleBySlug } from "@/lib/content";
import { Poster, QualityBadge, Rail, TitleCard } from "@/components/title-card";
import { WatchlistButton } from "@/components/watchlist-button";
import { SeasonBrowser } from "@/components/season-browser";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTitleBySlug((await params).slug);
  return t ? { title: `${t.name} (${t.year})`, description: t.synopsis } : { title: "Not found" };
}

export default async function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [title, user] = await Promise.all([getTitleBySlug(slug), getCurrentUser()]);
  if (!title) notFound();

  let inWatchlist = false;
  if (user) {
    const [row] = await db
      .select({ t: watchlist.titleId })
      .from(watchlist)
      .where(and(eq(watchlist.userId, user.id), eq(watchlist.titleId, title.id)))
      .limit(1);
    inWatchlist = !!row;
  }

  const firstEpisode = title.seasons[0]?.episodes[0];
  const watchHref = title.kind === "series" && firstEpisode ? `/watch/${title.slug}?ep=${firstEpisode.id}` : `/watch/${title.slug}`;
  const playable = title.kind === "series" ? title.seasons.some((s) => s.episodes.some((e) => e.sources.length)) : title.sources.length > 0;
  const directors = title.crew.filter((c) => c.role === "director");
  const writers = title.crew.filter((c) => c.role === "writer");
  const allSources = title.kind === "series" ? title.seasons.flatMap((s) => s.episodes.flatMap((e) => e.sources)) : title.sources;
  const providerNames = [...new Set(allSources.map((s) => s.provider))];
  const subtitleLangs = [...new Set(allSources.flatMap((s) => s.subtitleLanguages))];
  const audioLangs = [...new Set(allSources.flatMap((s) => s.audioLanguages))];

  return (
    <div className="-mt-16">
      <div className="relative h-[60vh] min-h-[420px] overflow-hidden">
        {title.backdropUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={title.backdropUrl} alt="" className="h-full w-full scale-110 object-cover object-[center_25%] blur-sm" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/80 to-transparent" />
      </div>

      <div className="mx-auto -mt-56 max-w-7xl px-4 sm:px-6">
        <div className="relative grid gap-8 md:grid-cols-[260px_1fr]">
          <div className="hidden md:block">
            <Poster src={title.posterUrl} alt={title.name} className="aspect-[2/3] w-full rounded-2xl shadow-2xl ring-1 ring-white/10" priority />
          </div>
          <div className="pt-6">
            <nav className="text-xs text-mist" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-snow">Home</Link> ›{" "}
              <Link href={title.kind === "series" ? "/series" : "/movies"} className="hover:text-snow">
                {title.kind === "series" ? "Series" : "Movies"}
              </Link>{" "}
              › <span className="text-snow">{title.name}</span>
            </nav>
            <h1 className="font-display mt-3 text-4xl font-bold leading-tight sm:text-5xl">{title.name}</h1>
            {title.originalName && title.originalName !== title.name && <p className="text-mist">Original title: {title.originalName}</p>}
            {title.tagline && <p className="mt-2 text-lg italic text-mist">{title.tagline}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-mist">
              <span className="font-semibold text-gold">★ {title.rating.toFixed(1)} <span className="font-normal text-mist">({title.voteCount.toLocaleString()} votes)</span></span>
              <span>{title.year}</span>
              {title.runtimeMinutes && <span>{title.runtimeMinutes} min</span>}
              <span>{title.country}</span>
              <QualityBadge q={title.maxQuality} />
              <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{title.license.split(" — ")[0]}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {title.genres.map((g) => (
                <Link key={g.id} href={`/${title.kind === "series" ? "series" : "movies"}?genre=${g.slug}`} className="rounded-full border border-white/10 px-3 py-1 text-xs text-mist hover:border-ember hover:text-ember">
                  {g.name}
                </Link>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {playable ? (
                <Link href={watchHref} className="inline-flex items-center gap-2 rounded-full bg-ember px-7 py-3 text-base font-bold text-ink transition hover:bg-ember-600 hover:shadow-[0_0_30px_rgba(255,92,56,0.45)]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  WATCH NOW
                </Link>
              ) : (
                <span className="rounded-full border border-white/10 px-6 py-3 text-mist">No authorized source available</span>
              )}
              <WatchlistButton titleId={title.id} initial={inWatchlist} loggedIn={!!user} />
              {title.trailerUrl && (
                <a href={title.trailerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-semibold hover:bg-white/5">
                  Trailer ↗
                </a>
              )}
            </div>

            <p className="mt-6 max-w-3xl leading-relaxed text-snow/85">{title.synopsis}</p>

            <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              {directors.length > 0 && (<div><dt className="text-mist">Director</dt><dd>{directors.map((d) => d.name).join(", ")}</dd></div>)}
              {writers.length > 0 && (<div><dt className="text-mist">Writer</dt><dd>{writers.map((d) => d.name).join(", ")}</dd></div>)}
              <div><dt className="text-mist">Release date</dt><dd>{title.releaseDate ?? title.year}</dd></div>
              <div><dt className="text-mist">Language</dt><dd className="uppercase">{title.language}</dd></div>
              {providerNames.length > 0 && (<div><dt className="text-mist">Servers</dt><dd>{providerNames.join(" · ")}</dd></div>)}
              <div><dt className="text-mist">Audio / Subtitles</dt><dd className="uppercase">{audioLangs.join(", ")} / {subtitleLangs.length ? subtitleLangs.join(", ") : "—"}</dd></div>
            </dl>
          </div>
        </div>

        {title.kind === "series" && <SeasonBrowser slug={title.slug} seasons={title.seasons} />}

        {title.kind === "movie" && title.sources.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-semibold">Available sources</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {title.sources.map((s, i) => (
                <Link key={s.id} href={`/watch/${title.slug}?src=${s.id}`} className="group flex items-center justify-between rounded-xl border border-white/10 bg-ink-800 p-4 transition hover:border-ember/50">
                  <div>
                    <p className="font-semibold">{s.label}</p>
                    <p className="text-xs text-mist">{s.provider} · {s.format.toUpperCase()} · {s.resolutions[s.resolutions.length - 1]}{s.subtitleLanguages.length ? ` · CC` : ""}</p>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full ${s.status === "offline" ? "bg-red-500" : s.status === "degraded" ? "bg-gold" : "bg-emerald-400"}`} title={s.status} />
                  {i === 0 && <span className="sr-only">Recommended</span>}
                </Link>
              ))}
            </div>
          </section>
        )}

        {title.availability.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-semibold">Where to watch</h2>
            <p className="mt-1 text-sm text-mist">Aggregated availability across platforms. Links open the official platform page.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {title.availability.map((a) => (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink-800 p-4 transition hover:border-ember/50">
                  {a.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <span className="font-display grid h-10 w-10 place-items-center rounded-lg bg-ink-600 text-sm font-bold">{a.platform.slice(0, 2).toUpperCase()}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{a.platform}</p>
                    <p className="text-xs text-mist">
                      <span className={a.kind === "free" ? "text-emerald-300" : a.kind === "subscription" ? "text-gold" : ""}>{a.kind === "free" ? "Free" : a.kind === "subscription" ? "Subscription" : a.kind === "rent" ? "Rent" : "Buy"}</span>
                      {a.price ? ` · ${a.price}` : ""}{a.quality ? ` · ${a.quality}` : ""}{a.region !== "GLOBAL" ? ` · ${a.region}` : ""}
                    </p>
                  </div>
                  <span className="text-mist">↗</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {title.cast.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-semibold">Cast</h2>
            <div className="rail mt-4">
              {title.cast.map((c) => (
                <div key={c.id} className="w-36 rounded-xl border border-white/5 bg-ink-800 p-4">
                  <div className="font-display mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink-600 text-lg font-bold text-mist">{c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                  <p className="mt-3 truncate text-center text-sm font-medium">{c.name}</p>
                  <p className="truncate text-center text-xs text-mist">{c.character}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {title.similar.length > 0 && (
        <Rail title="You may also like">
          {title.similar.map((t) => (<TitleCard key={t.id} item={t} />))}
        </Rail>
      )}
    </div>
  );
}
