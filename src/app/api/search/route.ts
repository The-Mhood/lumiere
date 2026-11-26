import { NextRequest } from "next/server";
import { queryCatalogue } from "@/lib/content";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  if (q.length < 1) return Response.json({ items: [], total: 0 });
  const limit = Math.min(24, Number(sp.get("limit") ?? 12));
  const result = await queryCatalogue({ q, pageSize: limit, page: 1 });
  return Response.json(result, { headers: { "Cache-Control": "public, max-age=30" } });
}
