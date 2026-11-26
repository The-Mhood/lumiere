import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { watchProgress } from "@/db/schema";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/progress?titleId=1&episodeId=2 → current position for resume. */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ progress: null });
  const sp = new URL(req.url).searchParams;
  const titleId = Number(sp.get("titleId"));
  const episodeId = sp.get("episodeId") ? Number(sp.get("episodeId")) : null;
  const [row] = await db
    .select()
    .from(watchProgress)
    .where(
      and(
        eq(watchProgress.userId, userId),
        eq(watchProgress.titleId, titleId),
        episodeId ? eq(watchProgress.episodeId, episodeId) : isNull(watchProgress.episodeId),
      ),
    )
    .limit(1);
  return Response.json({ progress: row ?? null });
}

/** POST — upsert playback position. Called by the player every few seconds. */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ ok: false, reason: "anonymous" });
  const body = await req.json().catch(() => null);
  const titleId = Number(body?.titleId);
  const episodeId = body?.episodeId ? Number(body.episodeId) : null;
  const position = Number(body?.position ?? 0);
  const duration = Number(body?.duration ?? 0);
  if (!titleId || !Number.isFinite(position)) return Response.json({ error: "bad payload" }, { status: 400 });
  const completed = duration > 0 && position / duration > 0.95;

  const match = and(
    eq(watchProgress.userId, userId),
    eq(watchProgress.titleId, titleId),
    episodeId ? eq(watchProgress.episodeId, episodeId) : isNull(watchProgress.episodeId),
  );
  const updated = await db
    .update(watchProgress)
    .set({ positionSeconds: position, durationSeconds: duration, completed, updatedAt: new Date() })
    .where(match)
    .returning({ id: watchProgress.id });
  if (!updated.length) {
    await db
      .insert(watchProgress)
      .values({ userId, titleId, episodeId, positionSeconds: position, durationSeconds: duration, completed, updatedAt: new Date() });
  }
  return Response.json({ ok: true, completed });
}
