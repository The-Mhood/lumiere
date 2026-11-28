import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { aggregatorRuns, availability, credits, genres, people, providers, sources, titleGenres, titles } from "@/db/schema";
import { cache } from "../cache";
import { detectFormat, hostAllowed } from "../streaming";
import { cinejoyAdapter } from "./cinejoy";
import { internetArchiveAdapter } from "./internet-archive";
import { tmdbAdapter } from "./tmdb";
import type { AggregatedAvailability, AggregatedTitle, AggregatorAdapter } from "./types";

export const ADAPTERS: AggregatorAdapter[] = [internetArchiveAdapter, tmdbAdapter, cinejoyAdapter];

export function getAdapter(key: string) {
  return ADAPTERS.find((a) => a.key === key) ?? null;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function ensureProviders(adapter: AggregatorAdapter) {
  const map = new Map<string, { id: number; allowedHosts: string[]; authorized: boolean }>();
  for (const p of adapter.providers) {
    const [row] = await db
      .insert(providers)
      .values({ slug: p.slug, name: p.name, allowedHosts: p.allowedHosts, priority: p.priority, authorized: true })
      .onConflictDoUpdate({ target: providers.slug, set: { name: p.name, allowedHosts: p.allowedHosts, priority: p.priority } })
      .returning();
    map.set(row.slug, { id: row.id, allowedHosts: row.allowedHosts, authorized: row.authorized });
  }
  return map;
}

async function ensureGenres(names: string[]) {
  const map = new Map<string, number>();
  if (!names.length) return map;
  await db
    .insert(genres)
    .values(names.map((n) => ({ slug: slugify(n), name: n })))
    .onConflictDoNothing();
  const rows = await db.select().from(genres).where(inArray(genres.slug, names.map(slugify)));
  for (const r of rows) map.set(r.slug, r.id);
  return map;
}

async function syncAvailability(titleId: number, items: AggregatedAvailability[]) {
  for (const a of items) {
    await db
      .insert(availability)
      .values({
        titleId,
        platform: a.platform,
        platformSlug: a.platformSlug,
        kind: a.kind,
        region: a.region ?? "GLOBAL",
        url: a.url,
        logoUrl: a.logoUrl,
        price: a.price,
        quality: a.quality,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [availability.titleId, availability.platformSlug, availability.kind, availability.region],
        set: { url: a.url, logoUrl: a.logoUrl, price: a.price, quality: a.quality, platform: a.platform, updatedAt: new Date() },
      });
  }
}

async function upsertTitle(
  t: AggregatedTitle,
  providerMap: Map<string, { id: number; allowedHosts: string[]; authorized: boolean }>,
  genreMap: Map<string, number>,
): Promise<"imported" | "updated" | "skipped"> {
  // Validate sources before touching the DB: unknown provider, wrong host, or
  // format mismatch means the source is dropped (never trust an arbitrary URL).
  const validSources = t.sources.filter((s) => {
    const p = providerMap.get(s.providerSlug);
    return p && p.authorized && hostAllowed(s.url, p.allowedHosts) && detectFormat(s.url) === s.format;
  });
  if (!validSources.length && !t.availability.length) return "skipped";

  const [existing] = await db
    .select({ id: titles.id })
    .from(titles)
    .where(and(eq(titles.externalSource, t.externalSource), eq(titles.externalId, t.externalId)))
    .limit(1);

  const values = {
    kind: t.kind,
    name: t.name,
    originalName: t.originalName ?? t.name,
    synopsis: t.synopsis,
    year: t.year,
    releaseDate: t.releaseDate,
    runtimeMinutes: t.runtimeMinutes,
    country: t.country,
    language: t.language ?? "en",
    rating: t.rating,
    voteCount: t.voteCount,
    popularity: t.popularity,
    posterUrl: t.posterUrl,
    backdropUrl: t.backdropUrl ?? t.posterUrl,
    license: t.license,
    maxQuality: validSources.length ? bestResolution(validSources.flatMap((s) => s.resolutions)) : "unverified",
    externalSource: t.externalSource,
    externalId: t.externalId,
  };

  let titleId: number;
  let result: "imported" | "updated";
  if (existing) {
    titleId = existing.id;
    await db.update(titles).set(values).where(eq(titles.id, titleId));
    await db.delete(sources).where(and(eq(sources.titleId, titleId), isNull(sources.episodeId)));
    await db.delete(titleGenres).where(eq(titleGenres.titleId, titleId));
    await db.delete(credits).where(eq(credits.titleId, titleId));
    result = "updated";
  } else {
    let slug = slugify(`${t.name}-${t.year}`) || `${t.externalSource}-${slugify(t.externalId)}`;
    const [clash] = await db.select({ id: titles.id }).from(titles).where(eq(titles.slug, slug)).limit(1);
    if (clash) slug = `${slug}-${slugify(t.externalId)}`.slice(0, 100);
    const [row] = await db.insert(titles).values({ ...values, slug }).returning({ id: titles.id });
    titleId = row.id;
    result = "imported";
  }

  if (t.genres.length) {
    await db.insert(titleGenres).values(t.genres.map((g) => ({ titleId, genreId: genreMap.get(slugify(g))! })).filter((r) => r.genreId)).onConflictDoNothing();
  }
  for (const [i, name] of (t.directors ?? []).entries()) {
    const [existingPerson] = await db.select().from(people).where(eq(people.name, name)).limit(1);
    const person = existingPerson ?? (await db.insert(people).values({ name }).returning())[0];
    await db.insert(credits).values({ titleId, personId: person.id, role: "director", order: i });
  }
  if (validSources.length) {
    await db.insert(sources).values(
      validSources.map((s) => ({
        providerId: providerMap.get(s.providerSlug)!.id,
        titleId,
        episodeId: null,
        label: s.label,
        url: s.url,
        format: s.format,
        resolutions: s.resolutions,
        audioLanguages: s.audioLanguages ?? ["en"],
        subtitleLanguages: s.subtitleLanguages ?? [],
        subtitles: [],
        status: "unknown" as const,
        priority: s.priority ?? 100,
      })),
    );
  }
  await syncAvailability(titleId, t.availability);
  return result;
}

function bestResolution(res: string[]) {
  const n = res.map((r) => parseInt(r, 10)).filter(Boolean);
  const h = Math.max(0, ...n);
  if (h >= 2160) return "2160p";
  if (h >= 1440) return "1440p";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  if (h >= 480) return "480p";
  return h ? `${h}p` : "480p";
}

export async function runAggregation(adapterKey: string, limit = 40, catalogue?: AggregatedTitle[]) {
  const adapter = getAdapter(adapterKey);
  if (!adapter) throw new Error(`Unknown adapter ${adapterKey}`);
  const [run] = await db.insert(aggregatorRuns).values({ adapter: adapter.key }).returning();
  const errors: string[] = [];
  const log = (m: string) => {
    console.log(`[aggregate:${adapter.key}] ${m}`);
    if (/error|fail/i.test(m) && errors.length < 50) errors.push(m);
  };
  let imported = 0, updated = 0, skipped = 0;

  try {
    if (!catalogue && !adapter.configured()) throw new Error(`${adapter.name} is not configured (missing required integration settings).`);
    const providerMap = await ensureProviders(adapter);
    const items = catalogue ?? await adapter.fetchCatalogue({ limit, log });
    const genreMap = await ensureGenres([...new Set(items.flatMap((i) => i.genres))]);
    for (const item of items) {
      try {
        const r = await upsertTitle(item, providerMap, genreMap);
        if (r === "imported") imported++;
        else if (r === "updated") updated++;
        else skipped++;
      } catch (e) {
        log(`error upserting ${item.externalId}: ${(e as Error).message}`);
        skipped++;
      }
    }
    if (adapter.enrich) {
      const existing = await db
        .select({ id: titles.id, name: titles.name, year: titles.year, kind: titles.kind })
        .from(titles)
        .where(or(isNull(titles.externalSource), eq(titles.externalSource, adapter.key)))
        .limit(limit);
      const enriched = await adapter.enrich(existing, { limit, log });
      for (const e of enriched) {
        await syncAvailability(e.titleId, e.availability);
        updated++;
      }
    }
    // Probe imported media immediately so verified titles can appear in the
    // browse catalogue without waiting for a separate scheduler cycle.
    const { sweepSourceHealth } = await import("../streaming/health-sweep");
    const health = await sweepSourceHealth(Math.min(200, Math.max(1, items.length)));
    log("source health sweep: " + health.checked + " checked, " + health.online + " online, " + health.offline + " offline");
    cache.clearPrefix("");
    await db.update(aggregatorRuns).set({ status: "success", imported, updated, skipped, errors, finishedAt: new Date() }).where(eq(aggregatorRuns.id, run.id));
    return { runId: run.id, status: "success" as const, imported, updated, skipped, errors };
  } catch (e) {
    const message = (e as Error).message;
    await db.update(aggregatorRuns).set({ status: "failed", imported, updated, skipped, errors: [...errors, message], finishedAt: new Date() }).where(eq(aggregatorRuns.id, run.id));
    return { runId: run.id, status: "failed" as const, imported, updated, skipped, errors: [...errors, message] };
  }
}

export async function aggregatorStatus() {
  const runs = await db.select().from(aggregatorRuns).orderBy(aggregatorRuns.startedAt);
  const counts = await db
    .select({ source: titles.externalSource })
    .from(titles)
    .where(inArray(titles.externalSource, ADAPTERS.map((a) => a.key)));
  const availRows = await db.select({ slug: availability.platformSlug, platform: availability.platform }).from(availability);
  const platforms = new Map<string, { platform: string; count: number }>();
  for (const a of availRows) platforms.set(a.slug, { platform: a.platform, count: (platforms.get(a.slug)?.count ?? 0) + 1 });
  return {
    adapters: ADAPTERS.map((a) => ({
      key: a.key,
      name: a.name,
      description: a.description,
      configured: a.configured(),
      titles: counts.filter((c) => c.source === a.key).length,
      lastRun: [...runs].reverse().find((r) => r.adapter === a.key) ?? null,
    })),
    platforms: [...platforms.values()].sort((a, b) => b.count - a.count),
    recentRuns: runs.slice(-10).reverse(),
  };
}
