import { curatedSourceMatches } from "./curated-matches";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { titles, sources, providers, episodes } from "@/db/schema";
import type { SourceRecord } from "../streaming";
import { SourceResolver, type ProviderAdapter, type TitleMatch } from "./resolver";

/** Authorized catalogue adapter. Each CDN is isolated behind its own adapter.
 * Stable, licensed public URLs may be catalogued. Expiring integrations should
 * implement ProviderAdapter directly and resolve URLs on demand instead. */
class CatalogueProvider implements ProviderAdapter {
  constructor(readonly id: string, readonly priority: number) {}
  async search(query: string, signal: AbortSignal): Promise<TitleMatch[]> {
    signal.throwIfAborted();
    return db.select({ slug: titles.slug, name: titles.name, year: titles.year, kind: titles.kind })
      .from(titles).where(ilike(titles.name, `%${query.slice(0, 120)}%`)).limit(30);
  }
  async resolve(match: TitleMatch, signal: AbortSignal): Promise<SourceRecord[]> {
    signal.throwIfAborted();
    const [title] = await db.select().from(titles).where(and(eq(titles.slug, match.slug), eq(titles.year, match.year))).limit(1);
    if (!title) return [];
    if (match.episodeId) {
      const [episode] = await db.select().from(episodes).where(and(eq(episodes.id, match.episodeId), eq(episodes.titleId, title.id))).limit(1);
      if (!episode) return [];
    }
    const rows = await db.select({ source: sources, provider: providers }).from(sources)
      .innerJoin(providers, eq(providers.id, sources.providerId))
      .where(and(eq(providers.slug, this.id), eq(providers.authorized, true),
        match.episodeId ? eq(sources.episodeId, match.episodeId) : and(eq(sources.titleId, title.id), isNull(sources.episodeId))));
    signal.throwIfAborted();
    // Old health failures are retried after two minutes rather than permanently
    // hiding a source that has recovered.
    return rows.filter(({ source }) => title.externalSource || curatedSourceMatches(title.slug, source.url)).map(({ source, provider }) => ({ ...source, provider,
      status: source.lastCheckedAt && Date.now() - source.lastCheckedAt.getTime() > 120000 ? "unknown" : source.status }));
  }
}
let resolver: SourceResolver | undefined;
export async function getResolver() {
  if (!resolver) {
    const configured = await db.select().from(providers).where(eq(providers.authorized, true));
    resolver = new SourceResolver(configured.map((p) => new CatalogueProvider(p.slug, p.priority)));
  }
  return resolver;
}
