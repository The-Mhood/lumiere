import { db } from '@/db';
import { playbackChecks } from '@/db/schema';
import { eq } from 'drizzle-orm';

/** Records a real source lookup, not a promise that a subscription catalogue
 * is a playback provider. Expiring media URLs are never persisted here. */
export async function recordPlaybackLookup(titleId: number, available: boolean) {
  const checkedAt = new Date();
  await db.insert(playbackChecks).values({ titleId, available, checkedAt })
    .onConflictDoUpdate({ target: playbackChecks.titleId, set: { available, checkedAt } });
}
export async function recentlyPlayable(titleId: number) {
  const [check] = await db.select().from(playbackChecks).where(eq(playbackChecks.titleId, titleId));
  return Boolean(check?.available && Date.now() - check.checkedAt.getTime() < 86400000);
}
