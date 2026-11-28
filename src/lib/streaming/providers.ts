import { BrowserScraperProvider, configuredScraperSites } from "./browser-scraper";
import { BlenderProvider } from "./blender";
import { JellyfinProvider, jellyfinSettings } from "./jellyfin";
import { loadOwnedMediaConfig, OwnedMediaProvider } from "./owned-media";
import { curatedSourceMatches } from "./curated-matches";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { titles, sources, providers, episodes } from "@/db/schema";
import type { SourceRecord } from "../streaming";
import { SourceResolver, type ProviderAdapter, type TitleMatch } from "./resolver";
import { providerExtensions } from "./provider-extensions";

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
let signature = "";
export async function getResolver() {
  const configured = await db.select().from(providers).where(eq(providers.authorized, true));
  const scraperSites = configuredScraperSites();
  const worker = process.env.LUMIERE_MEDIA_WORKER_URL;
  const token = process.env.LUMIERE_MEDIA_WORKER_TOKEN;
  const ownedMedia = await loadOwnedMediaConfig();
  const jellyfin = jellyfinSettings();
  const current = JSON.stringify([worker, token, scraperSites, process.env.LUMIERE_OFFICIAL_SOURCES,
    ownedMedia, jellyfin ? [jellyfin.baseUrl.href, jellyfin.apiKey, jellyfin.priority, jellyfin.allowHttp] : null,
    configured.map((p) => [p.slug, p.priority, p.allowedHosts]),
    providerExtensions.map((adapter) => [adapter.id, adapter.priority])]);
  if (!resolver || signature !== current) {
    resolver = new SourceResolver([
      // Operator-owned/licensed media first, then the operator's own Jellyfin
      // library, then approved extension providers, public-page scrapers,
      // catalogue rows and optional official demonstration sources.
      ...(ownedMedia ? [new OwnedMediaProvider(ownedMedia)] : []),
      ...(jellyfin ? [new JellyfinProvider(jellyfin)] : []),
      ...providerExtensions,
      ...(worker && token && scraperSites.length ? [new BrowserScraperProvider(worker, token, scraperSites)] : []),
      ...configured.map((p) => new CatalogueProvider(p.slug, p.priority)),
      ...(process.env.LUMIERE_OFFICIAL_SOURCES === "0" ? [] : [new BlenderProvider()]),
    ]);
    signature = current;
  }
  return resolver;
}
