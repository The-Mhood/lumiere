import { eq } from "drizzle-orm";
import { db } from "@/db";
import { providers, sources } from "@/db/schema";
import { cache } from "@/lib/cache";
import { hostAllowed } from "@/lib/streaming";

export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid source" }, { status: 400 });
  const key = `health:${id}`;
  const hit = cache.get<{ status: string; latencyMs: number }>(key);
  if (hit) return Response.json({ id, ...hit, cached: true });
  const [row] = await db.select({ source: sources, provider: providers }).from(sources)
    .innerJoin(providers, eq(providers.id, sources.providerId)).where(eq(sources.id, id)).limit(1);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  if (!row.provider.authorized || !hostAllowed(row.source.url, row.provider.allowedHosts))
    return Response.json({ error: "Provider not authorized for this URL" }, { status: 403 });
  const started = Date.now();
  let status: "online" | "degraded" | "offline" = "offline";
  try {
    const res = await fetch(row.source.url, { method: "GET", redirect: "error",
      headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (res.ok) status = Date.now() - started > 3000 ? "degraded" : "online";
    await res.body?.cancel();
  } catch { /* bounded failure is recorded below */ }
  const latencyMs = Date.now() - started;
  await db.update(sources).set({ status, lastCheckedAt: new Date() }).where(eq(sources.id, id));
  cache.set(key, { status, latencyMs }, 120);
  return Response.json({ id, status, latencyMs });
}
