import Link from "next/link";
import { listCountries, listGenres, listYears, queryCatalogue, type CatalogueQuery, type SortKey } from "@/lib/content";
import { PosterGrid } from "./title-card";

export type SearchParams = Record<string, string | string[] | undefined>;

const SORTS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "rating", label: "Rating" },
  { key: "newest", label: "Recently added" },
  { key: "year", label: "Release date" },
  { key: "title", label: "A–Z" },
];

export function parseQuery(sp: SearchParams, kind?: "movie" | "series"): CatalogueQuery {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const sort = one("sort") as SortKey | undefined;
  return {
    kind,
    genre: one("genre") || undefined,
    year: one("year") ? Number(one("year")) : undefined,
    country: one("country") || undefined,
    quality: one("quality") || undefined,
    platform: one("platform") || undefined,
    q: one("q") || undefined,
    sort: SORTS.some((s) => s.key === sort) ? sort : "popular",
    page: one("page") ? Number(one("page")) : 1,
  };
}

function buildHref(base: string, q: CatalogueQuery, patch: Partial<CatalogueQuery>) {
  const merged = { ...q, ...patch, page: patch.page ?? 1 };
  const p = new URLSearchParams();
  if (merged.genre) p.set("genre", merged.genre);
  if (merged.year) p.set("year", String(merged.year));
  if (merged.country) p.set("country", merged.country);
  if (merged.quality) p.set("quality", merged.quality);
  if (merged.platform) p.set("platform", merged.platform);
  if (merged.q) p.set("q", merged.q);
  if (merged.sort && merged.sort !== "popular") p.set("sort", merged.sort);
  if (merged.page && merged.page > 1) p.set("page", String(merged.page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export async function Catalogue({ base, query, heading, intro }: { base: string; query: CatalogueQuery; heading: string; intro?: string }) {
  const [result, genres, countries, years] = await Promise.all([queryCatalogue(query), listGenres(), listCountries(), listYears()]);

  const Chip = ({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) => (
    <Link
      href={href}
      scroll={false}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs transition ${
        active ? "border-ember bg-ember text-ink font-semibold" : "border-white/10 text-mist hover:border-white/30 hover:text-snow"
      }`}
    >
      {children}
    </Link>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">{heading}</h1>
          {intro && <p className="mt-1 text-mist">{intro}</p>}
        </div>
        <p className="text-sm text-mist">{result.total} titles</p>
      </div>

      <div className="mt-6 space-y-3">
        <div className="rail">
          <Chip active={!query.genre} href={buildHref(base, query, { genre: undefined })}>All genres</Chip>
          {genres.map((g) => (
            <Chip key={g.id} active={query.genre === g.slug} href={buildHref(base, query, { genre: g.slug })}>{g.name}</Chip>
          ))}
        </div>
        <div className="rail">
          <span className="self-center text-xs uppercase tracking-wider text-mist/70">Year</span>
          <Chip active={!query.year} href={buildHref(base, query, { year: undefined })}>Any</Chip>
          {years.map((y) => (
            <Chip key={y} active={query.year === y} href={buildHref(base, query, { year: y })}>{y}</Chip>
          ))}
          <span className="ml-3 self-center text-xs uppercase tracking-wider text-mist/70">Country</span>
          <Chip active={!query.country} href={buildHref(base, query, { country: undefined })}>Any</Chip>
          {countries.map((c) => (
            <Chip key={c} active={query.country === c} href={buildHref(base, query, { country: c })}>{c}</Chip>
          ))}
          <span className="ml-3 self-center text-xs uppercase tracking-wider text-mist/70">Quality</span>
          <Chip active={!query.quality} href={buildHref(base, query, { quality: undefined })}>Any</Chip>
          <Chip active={query.quality === "2160p"} href={buildHref(base, query, { quality: "2160p" })}>4K</Chip>
          <Chip active={query.quality === "1080p"} href={buildHref(base, query, { quality: "1080p" })}>1080p</Chip>
          <span className="ml-3 self-center text-xs uppercase tracking-wider text-mist/70">Platform</span>
          <Chip active={!query.platform} href={buildHref(base, query, { platform: undefined })}>All</Chip>
          <Chip active={query.platform === "curated"} href={buildHref(base, query, { platform: "curated" })}>Lumière Originals</Chip>
          <Chip active={query.platform === "internet-archive"} href={buildHref(base, query, { platform: "internet-archive" })}>Internet Archive</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
          <span className="text-xs uppercase tracking-wider text-mist/70">Sort by</span>
          {SORTS.map((s) => (
            <Chip key={s.key} active={query.sort === s.key} href={buildHref(base, query, { sort: s.key })}>{s.label}</Chip>
          ))}
          {(query.genre || query.year || query.country || query.quality || query.platform) && (
            <Link href={buildHref(base, { q: query.q }, {})} className="ml-auto text-xs text-ember hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      </div>

      <div className="mt-8">
        <PosterGrid items={result.items} />
      </div>

      {result.pages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: result.pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={buildHref(base, query, { page: p })}
              className={`grid h-9 w-9 place-items-center rounded-lg text-sm ${
                p === result.page ? "bg-ember font-semibold text-ink" : "bg-white/5 text-mist hover:bg-white/10"
              }`}
              aria-current={p === result.page ? "page" : undefined}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
