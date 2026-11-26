import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { titles, watchlist } from "@/db/schema";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db
    .select({ titleId: watchlist.titleId, slug: titles.slug, addedAt: watchlist.addedAt })
    .from(watchlist)
    .innerJoin(titles, eq(titles.id, watchlist.titleId))
    .where(eq(watchlist.userId, userId))
    .orderBy(desc(watchlist.addedAt));
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { titleId } = await req.json();
  if (!Number.isInteger(titleId)) return Response.json({ error: "titleId required" }, { status: 400 });
  await db.insert(watchlist).values({ userId, titleId }).onConflictDoNothing();
  return Response.json({ ok: true, inWatchlist: true });
}

export async function DELETE(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { titleId } = await req.json();
  await db.delete(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.titleId, titleId)));
  return Response.json({ ok: true, inWatchlist: false });
}
