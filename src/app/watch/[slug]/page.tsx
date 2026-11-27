import Link from "next/link";
import { playbackIdentity } from "@/lib/streaming/identity";
import { getResolver } from "@/lib/streaming/providers";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { watchProgress } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getTitleBySlug } from "@/lib/content";
import { RemotePreviewPlayer } from "@/components/player/remote-preview-player";
import { remotePreviewConfigured } from "@/lib/streaming/remote-preview";
import { SeasonBrowser } from "@/components/season-browser";
import { Rail, TitleCard } from "@/components/title-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTitleBySlug((await params).slug);
  return { title: t ? `Watch ${t.name}` : "Watch" };
}

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ep?: string; src?: string }>;
}) {
  const [{ slug }, sp, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  const title = await getTitleBySlug(slug);
  if (!title) notFound();

  const allEpisodes = title.seasons.flatMap((s) => s.episodes.map((e) => ({ ...e, seasonNumber: s.number })));
  let episode = allEpisodes.find((e) => e.id === Number(sp.ep));
  if (title.kind === "series" && !episode) episode = allEpisodes[0];
  if (title.kind === "series" && !episode) notFound();

  const remotePreview = remotePreviewConfigured() && title.kind === 'movie' && Boolean(playbackIdentity(title).tmdbId);
  const resolution = remotePreview ? { sources: [], reports: [] } : await (await getResolver()).resolve(playbackIdentity(title, episode?.id));
  const sources = resolution.sources;
  const idx = episode ? allEpisodes.findIndex((e) => e.id === episode!.id) : -1;
  const prev = idx > 0 ? allEpisodes[idx - 1] : undefined;
  const next = idx >= 0 && idx < allEpisodes.length - 1 ? allEpisodes[idx + 1] : undefined;

  let resumeAt = 0;
  if (user) {
    const [row] = await db
      .select({ pos: watchProgress.positionSeconds, completed: watchProgress.completed })
      .from(watchProgress)
      .where(
        and(
          eq(watchProgress.userId, user.id),
          eq(watchProgress.titleId, title.id),
          episode ? eq(watchProgress.episodeId, episode.id) : isNull(watchProgress.episodeId),
        ),
      )
      .limit(1);
    if (row && !row.completed) resumeAt = row.pos;
  }

  const heading = title.name;
  const subheading = episode ? `S${episode.seasonNumber} · E${episode.number} — ${episode.name}` : `${title.year} · ${title.runtimeMinutes ?? ""} min`;

  return (
    <div className="-mt-16 pt-16">
      <div className="bg-black">
        <div className="mx-auto max-w-[1400px]">
          <RemotePreviewPlayer
            slug={remotePreview ? title.slug : undefined}
            key={`${title.id}-${episode?.id ?? "m"}`}
            titleId={title.id}
            episodeId={episode?.id}
            heading={heading}
            subheading={subheading}
            poster={title.backdropUrl}
            sources={sources}
            initialSourceId={sp.src ? Number(sp.src) : undefined}
            resumeAt={resumeAt}
            loggedIn={!!user}
            preferredSubtitle={user?.preferences.subtitleLang || undefined}
            preferredAudio={user?.preferences.audioLang || undefined}
            nextHref={next ? `/watch/${title.slug}?ep=${next.id}` : undefined}
            prevHref={prev ? `/watch/${title.slug}?ep=${prev.id}` : undefined}
            backHref={`/title/${title.slug}`}
          />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {!remotePreview && !sources.length && <a href={`/watch/${title.slug}${episode ? `?ep=${episode.id}` : ''}`} className="mb-4 inline-flex rounded-full border border-white/15 px-5 py-2 text-sm hover:bg-white/5">Retry source search</a>}
        <details className="mb-6 rounded-xl border border-white/10 p-4 text-sm text-mist">
          <summary className="cursor-pointer">{remotePreview ? "Remote preview · source lookup happens in the player" : `Source availability · ${sources.length} playable source${sources.length === 1 ? "" : "s"}`}</summary>
          <ul className="mt-3 space-y-1">
            {resolution.reports.map((r) => <li key={r.provider}>{r.provider}: {r.status}{r.error ? ` — ${r.error}` : ""}</li>)}
          </ul>
        </details>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <Link href={`/title/${title.slug}`} className="font-display text-3xl font-bold hover:text-ember">
              {title.name}
            </Link>
            {episode && (
              <p className="mt-1 text-lg text-mist">
                S{episode.seasonNumber} · E{episode.number} — {episode.name}
              </p>
            )}
            <p className="mt-3 text-snow/80">{episode?.overview ?? title.synopsis}</p>
            <p className="mt-3 text-xs text-mist">
              Licensed under {title.license}. Streamed from authorized providers only.
              {!user && (
                <>
                  {" "}
                  <Link href={`/login?next=/watch/${title.slug}${episode ? `?ep=${episode.id}` : ""}`} className="text-ember hover:underline">
                    Sign in
                  </Link>{" "}
                  to save your progress.
                </>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            {prev && (
              <Link href={`/watch/${title.slug}?ep=${prev.id}`} className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
                ← Previous
              </Link>
            )}
            {next && (
              <Link href={`/watch/${title.slug}?ep=${next.id}`} className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-ink hover:bg-ember-600">
                Next episode →
              </Link>
            )}
          </div>
        </div>

        {title.kind === "series" && <SeasonBrowser slug={title.slug} seasons={title.seasons} currentEpisodeId={episode?.id} />}
      </div>

      {title.similar.length > 0 && (
        <Rail title="More like this">
          {title.similar.map((t) => (
            <TitleCard key={t.id} item={t} />
          ))}
        </Rail>
      )}
    </div>
  );
}
