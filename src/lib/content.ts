import { discoverMovies, materializeTmdbMovie, tmdbConfigured, tmdbGet, tmdbHomeMovies } from "./tmdb-discovery";
import { curatedSourceMatches } from "./streaming/curated-matches";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql, SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  availability,
  credits,
  episodes,
  genres,
  people,
  providers,
  seasons,
  sources,
  titleGenres,
  titles,
  watchProgress,
  type Title,
} from "@/db/schema";
import { cached } from "./cache";
import { rankSources, type PlayableSource, type SourceRecord } from "./streaming";

export type TitleCard = Pick<
  Title,
  "id" | "slug" | "kind" | "name" | "year" | "rating" | "posterUrl" | "maxQuality" | "runtimeMinutes" | "country"
>;

const cardColumns = {
  id: titles.id,
  slug: titles.slug,
  kind: titles.kind,
  name: titles.name,
  year: titles.year,
  rating: titles.rating,
  posterUrl: titles.posterUrl,
  maxQuality: titles.maxQuality,
  runtimeMinutes: titles.runtimeMinutes,
  country: titles.country,
};

export type SortKey = "popular" | "rating" | "newest" | "year" | "title";

export interface CatalogueQuery {
  kind?: "movie" | "series";
  genre?: string;
  year?: number;
  country?: string;
  quality?: string;
  platform?: string;
  q?: string;
  watchProvider?: number;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export async function listGenres() {
  if (tmdbConfigured()) {
    try {
      const result = await tmdbGet<{ genres: { id: number; name: string }[] }>("/genre/movie/list");
      return result.genres.map(g => ({ ...g, slug: g.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") }));
    } catch { /* Keep the local library usable during metadata outages. */ }
  }
  return cached("genres", 600, () => db.select().from(genres).orderBy(asc(genres.name)));
}

export async function listCountries() {
  return cached("countries", 600, async () => {
    const rows = await db.selectDistinct({ country: titles.country }).from(titles).orderBy(asc(titles.country));
    return rows.map((r) => r.country);
  });
}

export async function listYears() {
  return cached("years", 600, async () => {
    const rows = await db.selectDistinct({ year: titles.year }).from(titles).orderBy(desc(titles.year));
    return rows.map((r) => r.year);
  });
}

export async function queryCatalogue(q: CatalogueQuery) {
  let discoveryNotice: string | undefined;
  if (tmdbConfigured() && q.kind !== 'series' && !q.platform && !q.country && !q.quality) {
    try { return { ...await discoverMovies(q), discoveryNotice: undefined as string | undefined }; }
    catch { discoveryNotice = 'Live movie discovery is unavailable. Showing your local library.'; }
  }
  const page = Number.isFinite(q.page) ? Math.min(100000, Math.max(1, Math.floor(q.page!))) : 1;
  const pageSize = Number.isFinite(q.pageSize) ? Math.min(48, Math.max(1, Math.floor(q.pageSize!))) : 24;
  const where: SQL[] = [];

  if (q.kind) where.push(eq(titles.kind, q.kind));
  if (q.year) where.push(eq(titles.year, q.year));
  if (q.country) where.push(eq(titles.country, q.country));
  if (q.quality) where.push(eq(titles.maxQuality, q.quality));
  if (q.platform === "curated") where.push(sql`${titles.externalSource} is null`);
  else if (q.platform) where.push(eq(titles.externalSource, q.platform));
  if (q.q) {
    const pattern = `%${q.q.trim()}%`;
    where.push(or(ilike(titles.name, pattern), ilike(titles.originalName, pattern), ilike(titles.synopsis, pattern))!);
  }
  if (q.genre) {
    where.push(
      sql`${titles.id} in (select ${titleGenres.titleId} from ${titleGenres} join ${genres} on ${genres.id} = ${titleGenres.genreId} where ${genres.slug} = ${q.genre})`,
    );
  }

  const orderBy = {
    popular: [desc(titles.popularity)],
    rating: [desc(titles.rating), desc(titles.voteCount)],
    newest: [desc(titles.createdAt)],
    year: [desc(titles.year), desc(titles.popularity)],
    title: [asc(titles.name)],
  }[q.sort ?? "popular"] ?? [desc(titles.popularity)];

  const cond = where.length ? and(...where) : undefined;
  const [items, [{ count }]] = await Promise.all([
    db
      .select(cardColumns)
      .from(titles)
      .where(cond)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(titles).where(cond),
  ]);

  return { items, total: count, page, pageSize, pages: Math.max(1, Math.ceil(count / pageSize)), discoveryNotice };
}

export async function homeRails() {
  return cached("home", 60, async () => {
    const [featured, trending, popular, recent, series, topRated] = await Promise.all([
      db.select().from(titles).where(eq(titles.featured, true)).orderBy(desc(titles.popularity)).limit(5),
      db.select(cardColumns).from(titles).orderBy(desc(titles.popularity)).limit(12),
      db.select(cardColumns).from(titles).where(eq(titles.kind, "movie")).orderBy(desc(titles.voteCount)).limit(12),
      db.select(cardColumns).from(titles).orderBy(desc(titles.createdAt), desc(titles.id)).limit(12),
      db.select(cardColumns).from(titles).where(eq(titles.kind, "series")).orderBy(desc(titles.popularity)).limit(12),
      db.select(cardColumns).from(titles).orderBy(desc(titles.rating)).limit(12),
    ]);
    const latestEpisodes = await db
      .select({
        id: episodes.id,
        name: episodes.name,
        number: episodes.number,
        seasonNumber: seasons.number,
        stillUrl: episodes.stillUrl,
        airDate: episodes.airDate,
        title: cardColumns,
      })
      .from(episodes)
      .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
      .innerJoin(titles, eq(titles.id, episodes.titleId))
      .orderBy(desc(episodes.airDate), desc(episodes.id))
      .limit(8);
    const cinejoy = await db.select(cardColumns).from(titles).where(eq(titles.externalSource, "cinejoy")).orderBy(desc(titles.createdAt), desc(titles.id)).limit(24);
    const archive = await db.select(cardColumns).from(titles).where(eq(titles.externalSource, "internet-archive")).orderBy(desc(titles.rating), desc(titles.popularity)).limit(14);
    const genreRows = await db.select().from(genres).orderBy(asc(genres.name));
    const collections = await Promise.all(
      genreRows.slice(0, 4).map(async (g) => ({
        genre: g,
        items: await db
          .select(cardColumns)
          .from(titles)
          .innerJoin(titleGenres, eq(titleGenres.titleId, titles.id))
          .where(eq(titleGenres.genreId, g.id))
          .orderBy(desc(titles.popularity))
          .limit(12),
      })),
    );
    const local = { featured, trending, popular, recent, series, topRated, latestEpisodes, collections, archive, cinejoy, watchProviders: [] as { id: number; name: string; logo: string | null }[], discoveryNotice: undefined as string | undefined };
    if (tmdbConfigured()) {
      try { return { ...local, ...await tmdbHomeMovies() }; }
      catch { return { ...local, discoveryNotice: 'Live movie discovery is unavailable. Showing your local library.' }; }
    }
    return local;
  });
}

export async function getTitleBySlug(slug: string) {
  let [title] = await db.select().from(titles).where(eq(titles.slug, slug)).limit(1);
  if (!title && /^tmdb-movie-[1-9]\d{0,9}$/.test(slug) && tmdbConfigured()) {
    try { await materializeTmdbMovie(slug); }
    catch (error) { if (error instanceof Error && error.message === 'TMDB discovery HTTP 404') return null; throw error; }
    [title] = await db.select().from(titles).where(eq(titles.slug, slug)).limit(1);
  }
  if (!title) return null;

  const [genreRows, creditRows, seasonRows, episodeRows, rawSources, availabilityRows] = await Promise.all([
    db
      .select({ id: genres.id, slug: genres.slug, name: genres.name })
      .from(titleGenres)
      .innerJoin(genres, eq(genres.id, titleGenres.genreId))
      .where(eq(titleGenres.titleId, title.id)),
    db
      .select({ id: credits.id, role: credits.role, character: credits.character, name: people.name, order: credits.order })
      .from(credits)
      .innerJoin(people, eq(people.id, credits.personId))
      .where(eq(credits.titleId, title.id))
      .orderBy(asc(credits.order)),
    db.select().from(seasons).where(eq(seasons.titleId, title.id)).orderBy(asc(seasons.number)),
    db.select().from(episodes).where(eq(episodes.titleId, title.id)).orderBy(asc(episodes.number)),
    db
      .select({ source: sources, provider: providers })
      .from(sources)
      .innerJoin(providers, eq(providers.id, sources.providerId))
      .where(or(eq(sources.titleId, title.id), inArray(sources.episodeId, episodeRowsSub(title.id)))),
    db.select().from(availability).where(eq(availability.titleId, title.id)).orderBy(asc(availability.kind), asc(availability.platform)),
  ]);

  const genreIds = genreRows.map((g) => g.id);
  const similar = genreIds.length
    ? await db
        .selectDistinctOn([titles.id], cardColumns)
        .from(titles)
        .innerJoin(titleGenres, eq(titleGenres.titleId, titles.id))
        .where(and(inArray(titleGenres.genreId, genreIds), ne(titles.id, title.id)))
        .limit(12)
    : [];

  const toRecord = (r: { source: typeof sources.$inferSelect; provider: typeof providers.$inferSelect }): SourceRecord => ({
    id: r.source.id,
    label: r.source.label,
    url: r.source.url,
    format: r.source.format,
    resolutions: r.source.resolutions,
    audioLanguages: r.source.audioLanguages,
    subtitleLanguages: r.source.subtitleLanguages,
    subtitles: r.source.subtitles,
    status: r.source.status,
    priority: r.source.priority,
    provider: {
      slug: r.provider.slug,
      name: r.provider.name,
      authorized: r.provider.authorized,
      allowedHosts: r.provider.allowedHosts,
      priority: r.provider.priority,
    },
  });

  const titleSources: PlayableSource[] = rankSources(rawSources.filter((r) => r.source.titleId && !r.source.episodeId && (title.externalSource || curatedSourceMatches(title.slug, r.source.url))).map(toRecord));
  const episodeSources: Record<number, PlayableSource[]> = {};
  for (const r of rawSources) {
    if (!r.source.episodeId) continue;
    (episodeSources[r.source.episodeId] ??= []);
  }
  for (const epId of Object.keys(episodeSources)) {
    episodeSources[Number(epId)] = rankSources(
      rawSources.filter((r) => r.source.episodeId === Number(epId)).map(toRecord),
    );
  }

  return {
    ...title,
    genres: genreRows,
    cast: creditRows.filter((c) => c.role === "cast"),
    crew: creditRows.filter((c) => c.role !== "cast"),
    seasons: seasonRows.map((s) => ({
      ...s,
      episodes: episodeRows
        .filter((e) => e.seasonId === s.id)
        .map((e) => ({ ...e, sources: title.externalSource || !title.slug.startsWith("caminandes") ? episodeSources[e.id] ?? [] : [] })),
    })),
    sources: titleSources,
    availability: availabilityRows,
    similar: similar.sort(() => 0.5 - Math.random()).slice(0, 12),
  };
}

function episodeRowsSub(titleId: number) {
  return db.select({ id: episodes.id }).from(episodes).where(eq(episodes.titleId, titleId));
}

export type TitleDetail = NonNullable<Awaited<ReturnType<typeof getTitleBySlug>>>;

export async function continueWatching(userId: number) {
  const rows = await db
    .select({
      progress: watchProgress,
      title: cardColumns,
      episode: { id: episodes.id, name: episodes.name, number: episodes.number, seasonId: episodes.seasonId },
    })
    .from(watchProgress)
    .innerJoin(titles, eq(titles.id, watchProgress.titleId))
    .leftJoin(episodes, eq(episodes.id, watchProgress.episodeId))
    .where(and(eq(watchProgress.userId, userId), eq(watchProgress.completed, false)))
    .orderBy(desc(watchProgress.updatedAt))
    .limit(12);
  return rows;
}
