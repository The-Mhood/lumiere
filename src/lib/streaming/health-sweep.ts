import { db } from '@/db';
import { providers, sources } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { hostAllowed, type SourceStatus } from '../streaming';

/**
 * Periodic source-health monitoring for catalogue sources (owned CDN rows,
 * Internet Archive imports, curated libraries). The least-recently-checked
 * sources are probed first with a tiny byte-range request; results persist so
 * `rankSources()` demotes dead servers for every viewer, and recovered servers
 * rise again. Ephemeral scraper/Jellyfin grants are request-scoped and are
 * monitored through their own adapter health reports instead.
 */

export interface SweepResult {
  running: boolean;
  checked: number;
  online: number;
  degraded: number;
  offline: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

const shared = globalThis as typeof globalThis & { __sourceHealthSweep?: SweepResult };
export function sourceHealthStatus(): SweepResult {
  return shared.__sourceHealthSweep ?? { running: false, checked: 0, online: 0, degraded: 0, offline: 0 };
}

function classify(status: number, mime: string): SourceStatus {
  if (status === 404 || status === 410 || status === 403 || status === 401) return 'offline';
  if (status >= 500) return 'degraded';
  if (status >= 200 && status < 400) {
    // An HTML/JSON body on a media URL is an error page, not media.
    if (/text\/html|application\/json/i.test(mime)) return 'offline';
    return 'online';
  }
  return 'degraded';
}

async function probe(url: string): Promise<SourceStatus> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const mime = response.headers.get('content-type') ?? '';
    // Never download the body: headers alone decide health.
    await response.body?.cancel();
    return classify(response.status, mime);
  } catch {
    return 'degraded'; // network failure/timeout may be transient
  }
}

export async function sweepSourceHealth(limit = 40): Promise<SweepResult> {
  if (sourceHealthStatus().running) return sourceHealthStatus();
  const state: SweepResult = { running: true, checked: 0, online: 0, degraded: 0, offline: 0, startedAt: new Date().toISOString() };
  shared.__sourceHealthSweep = state;
  try {
    const rows = await db.select({ source: sources, provider: providers }).from(sources)
      .innerJoin(providers, eq(providers.id, sources.providerId))
      .where(eq(providers.authorized, true))
      .orderBy(sql`${sources.lastCheckedAt} asc nulls first`)
      .limit(Math.min(200, Math.max(1, Math.floor(limit) || 40)));
    const queue = [...rows];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (;;) {
        const row = queue.shift();
        if (!row) return;
        const status = hostAllowed(row.source.url, row.provider.allowedHosts) ? await probe(row.source.url) : 'offline';
        await db.update(sources).set({ status, lastCheckedAt: new Date() }).where(eq(sources.id, row.source.id));
        state.checked++;
        state[status === 'online' ? 'online' : status === 'offline' ? 'offline' : 'degraded']++;
      }
    });
    await Promise.all(workers);
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Source health sweep failed';
  } finally {
    state.running = false;
    state.finishedAt = new Date().toISOString();
  }
  return state;
}
