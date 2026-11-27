import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { episodes, titles, watchlist, watchProgress } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { Poster, PosterGrid, TitleCard } from "@/components/title-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Library" };

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/library");

  const card = {
    id: titles.id, slug: titles.slug, kind: titles.kind, name: titles.name, year: titles.year, rating: titles.rating,
    posterUrl: titles.posterUrl, maxQuality: titles.maxQuality, runtimeMinutes: titles.runtimeMinutes, country: titles.country,
  };

  const [list, history] = await Promise.all([
    db.select(card).from(watchlist).innerJoin(titles, eq(titles.id, watchlist.titleId)).where(and(eq(watchlist.userId, user.id), isNotNull(titles.externalSource))).orderBy(desc(watchlist.addedAt)),
    db
      .select({ progress: watchProgress, title: card, episode: { id: episodes.id, name: episodes.name, number: episodes.number } })
      .from(watchProgress)
      .innerJoin(titles, eq(titles.id, watchProgress.titleId))
      .leftJoin(episodes, eq(episodes.id, watchProgress.episodeId))
      .where(and(eq(watchProgress.userId, user.id), isNotNull(titles.externalSource)))
      .orderBy(desc(watchProgress.updatedAt))
      .limit(40),
  ]);

  const inProgress = history.filter((h) => !h.progress.completed);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Hi, {user.name}</h1>
      <p className="mt-1 text-mist">Your watchlist, progress and viewing history — synced across devices.</p>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold">Continue watching</h2>
        {inProgress.length === 0 ? (
          <p className="mt-3 text-mist">Nothing in progress. Start something from the <Link href="/" className="text-ember">homepage</Link>.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inProgress.map((h) => {
              const pct = h.progress.durationSeconds ? Math.round((h.progress.positionSeconds / h.progress.durationSeconds) * 100) : 0;
              return (
                <Link key={h.progress.id} href={`/watch/${h.title.slug}${h.episode ? `?ep=${h.episode.id}` : ""}`} className="group flex gap-4 rounded-2xl border border-white/5 bg-ink-800 p-3 transition hover:border-ember/40">
                  <Poster src={h.title.posterUrl} alt={h.title.name} className="h-28 w-20 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold group-hover:text-ember">{h.title.name}</p>
                    {h.episode && <p className="truncate text-sm text-mist">E{h.episode.number} · {h.episode.name}</p>}
                    <p className="mt-1 text-xs text-mist">{pct}% watched</p>
                    <div className="mt-2 h-1 rounded-full bg-white/10"><div className="h-full rounded-full bg-ember" style={{ width: `${pct}%` }} /></div>
                    <p className="mt-2 text-xs text-mist/70">{h.progress.updatedAt.toLocaleString()}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-semibold">Watchlist <span className="text-base font-normal text-mist">({list.length})</span></h2>
        <div className="mt-4">
          {list.length ? <PosterGrid items={list} /> : <p className="text-mist">Your watchlist is empty. Tap “Add to watchlist” on any title.</p>}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-semibold">Recently watched</h2>
        <div className="rail mt-4">
          {history.length ? history.map((h) => <TitleCard key={h.progress.id} item={h.title} progress={h.progress.durationSeconds ? (h.progress.positionSeconds / h.progress.durationSeconds) * 100 : 0} />) : <p className="text-mist">No history yet.</p>}
        </div>
      </section>
    </div>
  );
}
