import { rankSources, type SourceRecord, type PlayableSource } from "../streaming";

export interface TitleMatch {
  slug: string;
  name: string;
  year: number;
  kind: "movie" | "series";
  episodeId?: number;
  episodeName?: string;
  tmdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
}
export interface ProviderAdapter {
  id: string;
  priority: number;
  timeoutMs?: number;
  retries?: number;
  search(query: string, signal: AbortSignal): Promise<TitleMatch[]>;
  resolve(title: TitleMatch, signal: AbortSignal): Promise<SourceRecord[]>;
}
export interface ProviderReport {
  provider: string;
  status: "available" | "unavailable" | "error";
  attempts: number;
  latencyMs: number;
  error?: string;
}
export interface Resolution { sources: PlayableSource[]; reports: ProviderReport[] }

/** A deadline races the adapter as well as aborting it: even an adapter that
 * ignores AbortSignal cannot hold the caller in an endless loading state. */
async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, timeout: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Provider timed out")); }, timeout);
      }),
    ]);
  } finally { clearTimeout(timer!); }
}

export class SourceResolver {
  private health = new Map<string, ProviderReport>();
  constructor(private adapters: ProviderAdapter[], private timeoutMs = 6000, private retries = 1) {}
  getHealth(): ProviderReport[] { return [...this.health.values()]; }
  async search(query: string): Promise<TitleMatch[]> {
    const responses = await Promise.allSettled(this.adapters.map((a) => bounded((s) => a.search(query, s), this.timeoutMs)));
    return [...new Map(responses.flatMap((r) => r.status === "fulfilled" ? r.value : []).map((t) => [t.slug, t])).values()];
  }
  async resolve(title: TitleMatch): Promise<Resolution> {
    const results = await Promise.all([...this.adapters].sort((a, b) => a.priority - b.priority).map(async (adapter) => {
      const start = Date.now();
      let attempts = 0;
      let error: string | undefined;
      let records: SourceRecord[] = [];
      for (; attempts <= (adapter.retries ?? this.retries); ) {
        attempts++;
        try { records = await bounded((s) => adapter.resolve(title, s), adapter.timeoutMs ?? this.timeoutMs); error = undefined; break; }
        catch (e) { error = e instanceof Error ? e.message : String(e); }
      }
      const playable = rankSources(records);
      const report: ProviderReport = { provider: adapter.id, attempts, latencyMs: Date.now() - start,
        status: error ? "error" : playable.length ? "available" : "unavailable", ...(error ? { error } : {}) };
      this.health.set(adapter.id, report);
      return { records, report };
    }));
    return { sources: rankSources(results.flatMap((r) => r.records)), reports: results.map((r) => r.report) };
  }
}
