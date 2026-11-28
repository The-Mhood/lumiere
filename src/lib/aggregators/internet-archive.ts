/**
 * Internet Archive adapter — public-domain & openly licensed feature films.
 * Uses the public advancedsearch + metadata APIs. Every imported item carries
 * an explicitly verified reuse licence before its Archive-hosted stream is exposed.
 */
import type { AggregatedTitle, AggregatorAdapter, AdapterContext } from "./types";

const SEARCH = "https://archive.org/advancedsearch.php";
const META = "https://archive.org/metadata/";

interface SearchDoc {
  identifier: string;
  title?: string;
  year?: number | string;
  description?: string | string[];
  downloads?: number;
  avg_rating?: number;
  num_reviews?: number;
  subject?: string | string[];
  runtime?: string;
  creator?: string | string[];
  licenseurl?: string;
  date?: string;
  language?: string | string[];
}

interface MetaFile {
  name: string;
  format?: string;
  height?: string;
  width?: string;
  length?: string;
  size?: string;
  source?: string;
}

const SUBJECT_TO_GENRE: [RegExp, string][] = [
  [/horror|zombie|vampire|monster/i, "Horror"],
  [/sci[- ]?fi|science fiction|space|alien|robot/i, "Sci-Fi"],
  [/comedy|comedies|slapstick|humor/i, "Comedy"],
  [/romance|romantic|love/i, "Romance"],
  [/thriller|suspense/i, "Thriller"],
  [/noir|crime|gangster|detective|murder/i, "Crime"],
  [/western|cowboy/i, "Western"],
  [/mystery/i, "Mystery"],
  [/war/i, "War"],
  [/documentary/i, "Documentary"],
  [/animation|animated|cartoon/i, "Animation"],
  [/adventure/i, "Adventure"],
  [/fantasy/i, "Fantasy"],
  [/action/i, "Action"],
  [/family|children|kids/i, "Family"],
  [/musical|music/i, "Musical"],
  [/drama/i, "Drama"],
];

/** 5-star archive ratings (few reviewers) → 0–10, shrunk toward a 6.8 prior. */
export function bayesianRating(avg5?: number, n?: number) {
  const prior = 6.8, weight = 8;
  const avg10 = (avg5 ?? 3.4) * 2;
  const votes = n ?? 0;
  return Math.round(((avg10 * votes + prior * weight) / (votes + weight)) * 10) / 10;
}

const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

function parseRuntime(rt?: string): number | undefined {
  if (!rt) return undefined;
  const m = rt.match(/(\d+):(\d+)(?::(\d+))?/);
  if (m) return m[3] ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]);
  const n = rt.match(/(\d+)\s*min/i);
  return n ? Number(n[1]) : undefined;
}

function cleanText(s: string | string[] | undefined) {
  return arr(s)
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Require an explicit, recognised rights declaration; collection membership alone is not proof. */
export function declaredReuseLicence(value?: string): string | null {
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (!["https:", "http:"].includes(url.protocol) || !["creativecommons.org", "www.creativecommons.org"].includes(url.hostname.toLowerCase())) return null;
  url.protocol = "https:";
  const path = url.pathname.toLowerCase().split("?")[0].replace(/\/$/, "");
  if (path === "/publicdomain/zero/1.0" || path === "/publicdomain/mark/1.0" || path === "/licenses/publicdomain") return "Internet Archive-declared public domain — " + url.href;
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "licenses" || !["by", "by-sa"].includes(parts[1]) || !["1.0", "2.0", "2.5", "3.0", "4.0"].includes(parts[2])) return null;
  return "Creative Commons " + (parts[1] === "by-sa" ? "Attribution-ShareAlike" : "Attribution") + " " + parts[2] + " — " + url.href;
}
function genresFor(subjects: string[], title: string) {
  const text = [...subjects, title].join(" ");
  const out = new Set<string>();
  for (const [re, g] of SUBJECT_TO_GENRE) if (re.test(text)) out.add(g);
  if (!out.size) out.add("Classic");
  return [...out].slice(0, 4);
}

async function getJson<T>(url: string, timeoutMs = 20000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Lumiere-Aggregator/1.0" } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export const internetArchiveAdapter: AggregatorAdapter = {
  key: "internet-archive",
  name: "Internet Archive",
  description: "Public-domain and Creative Commons feature films from archive.org's Feature Films collection.",
  configured: () => true,
  providers: [{ slug: "archive-org", name: "Internet Archive", allowedHosts: ["archive.org", "*.archive.org"], priority: 70 }],

  async fetchCatalogue(ctx: AdapterContext) {
    const rows = Math.min(200, Math.max(ctx.limit * 2, 20));
    const q = [
      "collection:feature_films",
      "mediatype:movies",
      "avg_rating:[3.5 TO 5]",
      "num_reviews:[3 TO null]",
      "licenseurl:*",
      "-collection:opensource_movies",
    ].join(" AND ");
    const params = new URLSearchParams({ q, rows: String(rows), output: "json" });
    for (const f of ["identifier", "title", "year", "description", "downloads", "avg_rating", "num_reviews", "subject", "runtime", "creator", "licenseurl", "date", "language"]) params.append("fl[]", f);
    params.append("sort[]", "downloads desc");

    const search = await getJson<{ response: { docs: SearchDoc[] } }>(`${SEARCH}?${params}`);
    ctx.log(`search returned ${search.response.docs.length} candidates`);

    const out: AggregatedTitle[] = [];
    for (const doc of search.response.docs) {
      if (out.length >= ctx.limit) break;
      try {
        const meta = await getJson<{ files?: MetaFile[]; metadata?: Record<string, string | string[]>; is_dark?: boolean }>(`${META}${doc.identifier}`);
        if (meta.is_dark || !meta.files?.length) {
          ctx.log(`skip ${doc.identifier}: unavailable`);
          continue;
        }
        const rawLicence = doc.licenseurl ?? (meta.metadata?.licenseurl as string | undefined);
        const licence = declaredReuseLicence(rawLicence);
        if (!licence) {
          ctx.log("skip item: no recognised reuse-rights declaration");
          continue;
        }
        const mp4s = meta.files
          .filter((f) => /\.mp4$/i.test(f.name) && !/sample|trailer/i.test(f.name))
          .map((f) => ({ ...f, h: Number(f.height) || 0, len: Number(f.length) || 0 }))
          .sort((a, b) => b.h - a.h);
        if (!mp4s.length) {
          ctx.log(`skip ${doc.identifier}: no mp4`);
          continue;
        }
        const best = mp4s[0];
        const runtime = parseRuntime(doc.runtime ?? (meta.metadata?.runtime as string)) ?? (best.len ? Math.round(best.len / 60) : undefined);
        if (runtime !== undefined && runtime < 40) {
          ctx.log(`skip ${doc.identifier}: short (${runtime} min)`);
          continue;
        }
        const yearRaw = String(doc.year ?? doc.date ?? meta.metadata?.date ?? "").match(/\d{4}/)?.[0];
        const year = yearRaw ? Number(yearRaw) : 1950;
        const subjects = arr(doc.subject).flatMap((s) => s.split(/[;,]/)).map((s) => s.trim()).filter(Boolean);
        const title = cleanText(doc.title) || doc.identifier;
        const synopsis = cleanText(doc.description).slice(0, 1200) || `${title} (${year}) — an openly licensed feature film preserved by the Internet Archive.`;
        const seen = new Set<number>();
        const sources = mp4s
          .filter((f) => f.h > 0 && !seen.has(f.h) && seen.add(f.h))
          .slice(0, 3)
          .map((f, i) => ({
            providerSlug: "archive-org",
            label: `Archive · ${f.h}p MP4`,
            url: `https://archive.org/download/${doc.identifier}/${encodeURIComponent(f.name)}`,
            format: "mp4" as const,
            resolutions: [`${f.h}p`],
            priority: i + 1,
          }));
        if (!sources.length) {
          sources.push({
            providerSlug: "archive-org",
            label: "Archive · MP4",
            url: `https://archive.org/download/${doc.identifier}/${encodeURIComponent(best.name)}`,
            format: "mp4" as const,
            resolutions: ["480p"],
            priority: 1,
          });
        }

        out.push({
          externalSource: "internet-archive",
          externalId: doc.identifier,
          kind: "movie",
          name: title,
          originalName: title,
          synopsis,
          year,
          releaseDate: String(year),
          runtimeMinutes: runtime,
          country: "United States",
          language: (arr(doc.language)[0] ?? "en").slice(0, 3).toLowerCase() === "eng" ? "en" : (arr(doc.language)[0] ?? "en").slice(0, 2).toLowerCase(),
          rating: bayesianRating(doc.avg_rating, doc.num_reviews),
          voteCount: doc.num_reviews ?? 0,
          popularity: Math.min(60, Math.log10((doc.downloads ?? 1000) + 1) * 8),
          posterUrl: `https://archive.org/services/img/${doc.identifier}`,
          backdropUrl: `https://archive.org/services/img/${doc.identifier}`,
          license: licence,
          genres: genresFor(subjects, title),
          directors: arr(doc.creator).slice(0, 2),
          sources,
          availability: [
            {
              platform: "Internet Archive",
              platformSlug: "internet-archive",
              kind: "free",
              region: "GLOBAL",
              url: `https://archive.org/details/${doc.identifier}`,
              quality: `${best.h || 480}p`,
            },
          ],
        });
      } catch (e) {
        ctx.log(`error ${doc.identifier}: ${(e as Error).message}`);
      }
    }
    return out;
  },
};
