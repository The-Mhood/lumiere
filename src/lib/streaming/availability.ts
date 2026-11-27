import { db } from '@/db';
import { playbackChecks, episodePlaybackChecks, episodes } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

/** Records a real source lookup, not a promise that a subscription catalogue
 * is a playback provider. Expiring media URLs are never persisted here. */
export async function recordPlaybackLookup(titleId: number, available: boolean, episodeId?: number) {
  const checkedAt = new Date();
  if (episodeId !== undefined) {
    // Guard ownership even for internal callers. A failed episode must not hide
    // a different episode of the same series that was successfully resolved.
    const [episode] = await db.select().from(episodes).where(and(eq(episodes.id, episodeId), eq(episodes.titleId, titleId)));
    if (!episode) throw new Error('Episode does not belong to title');
    await db.insert(episodePlaybackChecks).values({ episodeId, available, checkedAt })
      .onConflictDoUpdate({ target: episodePlaybackChecks.episodeId, set: { available, checkedAt } });
    const [recent] = await db.select({ count: sql<number>`count(*)::int` }).from(episodePlaybackChecks)
      .innerJoin(episodes, eq(episodes.id, episodePlaybackChecks.episodeId))
      .where(and(eq(episodes.titleId, titleId), eq(episodePlaybackChecks.available, true), sql`${episodePlaybackChecks.checkedAt} > now() - interval '24 hours'`));
    available = recent.count > 0;
  }
  await db.insert(playbackChecks).values({ titleId, available, checkedAt })
    .onConflictDoUpdate({ target: playbackChecks.titleId, set: { available, checkedAt } });
}
export async function recentlyPlayable(titleId: number) {
  const [check] = await db.select().from(playbackChecks).where(eq(playbackChecks.titleId, titleId));
  return Boolean(check?.available && Date.now() - check.checkedAt.getTime() < 86400000);
}
