import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sources } from "@/db/schema";
import { cache } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * Server-side source health probe. Issues a lightweight request against the
 * manifest/file and records the result so the ranking layer can demote bad sources.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const key = `health:${id}`;
  const hit = cache.get<{ status: string; latencyMs: number }>(key);
  if (hit) return Response.json({ id, ...hit, cached: true });

  const [src] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
  if (!src) return Response.json({ error: "Not found" }, { status: 404 });

  const started = Date.now();
  let status: "online" | "degraded" | "offline" = "offline";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(src.url, {
      method: "GET",
      headers: { Range: "bytes=0-1023" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    const latencyMs = Date.now() - started;
    if (res.ok || res.status === 206) status = latencyMs > 3000 ? "degraded" : "online";
  } catch {
    status = "offline";
  }
  const latencyMs = Date.now() - started;
  await db.update(sources).set({ status, lastCheckedAt: new Date() }).where(eq(sources.id, id));
  cache.set(key, { status, latencyMs }, 120);
  return Response.json({ id, status, latencyMs });
}
