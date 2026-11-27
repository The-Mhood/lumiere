import { NextRequest } from "next/server";
import { runAggregation, getAdapter } from "@/lib/aggregators";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/aggregate/sync?adapter=internet-archive&limit=40
 * Protected by AGGREGATOR_TOKEN when set (send as `Authorization: Bearer <token>`).
 */
export async function POST(req: NextRequest) {
  const token = process.env.AGGREGATOR_TOKEN;
  if ((!token && process.env.NODE_ENV === "production") || (token && req.headers.get("authorization") !== `Bearer ${token}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adapterKey = req.nextUrl.searchParams.get("adapter") ?? "internet-archive";
  const requested = Number(req.nextUrl.searchParams.get("limit") ?? 40);
  const limit = Number.isFinite(requested) ? Math.min(200, Math.max(1, Math.floor(requested))) : 40;
  if (!getAdapter(adapterKey)) return Response.json({ error: `Unknown adapter: ${adapterKey}` }, { status: 400 });
  const result = await runAggregation(adapterKey, limit);
  return Response.json(result, { status: result.status === "success" ? 200 : 502 });
}
