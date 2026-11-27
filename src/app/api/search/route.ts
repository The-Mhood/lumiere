import { NextRequest } from "next/server";
import { queryCatalogue, type SortKey } from "@/lib/content";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=...&kind=movie|series&page=1&pageSize=24
 *
 * Catalogue search over the local (authorized) catalogue. The previous
 * implementation imported a Python `aiohttp` module and an undefined
 * scraper, which broke the production build; search now runs against the
 * same query layer as the /search page.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind");
  const result = await queryCatalogue({
    kind: kind === "movie" || kind === "series" ? kind : undefined,
    genre: sp.get("genre") ?? undefined,
    year: sp.get("year") ? Number(sp.get("year")) : undefined,
    country: sp.get("country") ?? undefined,
    quality: sp.get("quality") ?? undefined,
    platform: sp.get("platform") ?? undefined,
    q: sp.get("q") ?? undefined,
    watchProvider: /^\d+$/.test(sp.get("watchProvider") ?? "") ? Number(sp.get("watchProvider")) : undefined,
    sort: (sp.get("sort") as SortKey) ?? "popular",
    page: Number(sp.get("page") ?? 1),
    pageSize: Number(sp.get("pageSize") ?? sp.get("limit") ?? 24),
  });
  return Response.json(
    { success: true, data: result },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
