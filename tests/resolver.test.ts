import { curatedSourceMatches } from "@/lib/streaming/curated-matches";
import { describe, expect, it } from "vitest";
import { SourceResolver, type ProviderAdapter } from "@/lib/streaming/resolver";
import type { SourceRecord } from "@/lib/streaming";
const title = { slug: "sintel", name: "Sintel", year: 2010, kind: "movie" as const };
const record: SourceRecord = { id: 1, label: "Test", url: "https://cdn.example.com/sintel.mpd", format: "dash",
  resolutions: ["1080p"], audioLanguages: ["en"], subtitleLanguages: [], subtitles: [], status: "online", priority: 1,
  provider: { slug: "fixture", name: "Fixture", authorized: true, priority: 1, allowedHosts: ["cdn.example.com"] } };
const adapter = (id: string, resolve: ProviderAdapter["resolve"]): ProviderAdapter => ({ id, priority: 1, search: async () => [title], resolve });
describe("provider resolution", () => {
  it("isolates failed providers and returns the healthy fallback", async () => {
    const resolver = new SourceResolver([adapter("failed", async () => { throw new Error("offline"); }), adapter("ok", async () => [record])]);
    const result = await resolver.resolve(title);
    expect(result.sources.map((s) => s.id)).toEqual([1]);
    expect(result.reports[0]).toMatchObject({ status: "error", attempts: 2, error: "offline" });
    expect(resolver.getHealth()).toHaveLength(2);
  });
  it("bounds adapters that ignore abort signals", async () => {
    const resolver = new SourceResolver([adapter("stuck", () => new Promise(() => {}))], 10, 0);
    const result = await resolver.resolve(title);
    expect(result.reports[0]).toMatchObject({ status: "error", error: "Provider timed out" });
  });
  it("retries a transient error and normalizes sources", async () => {
    let attempts = 0;
    const resolver = new SourceResolver([adapter("transient", async () => { if (++attempts === 1) throw new Error("retry"); return [record]; })]);
    expect((await resolver.resolve(title)).reports[0]).toMatchObject({ attempts: 2, status: "available" });
  });
  it("reports unavailable content and rejects unauthorized URLs", async () => {
    const resolver = new SourceResolver([adapter("empty", async () => []), adapter("bad", async () => [{ ...record, url: "https://evil.example/x.mpd" }])]);
    const result = await resolver.resolve(title);
    expect(result.sources).toEqual([]);
    expect(result.reports.every((r) => r.status === "unavailable")).toBe(true);
  });
  it("deduplicates title search results across providers", async () => {
    const resolver = new SourceResolver([adapter("one", async () => []), adapter("two", async () => [])]);
    expect(await resolver.search("Sintel")).toEqual([title]);
  });
});

describe("curated source identity", () => {
  it("rejects unrelated videos rather than playing a demo under a different title", () => {
    expect(curatedSourceMatches("spring", "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd")).toBe(false);
    expect(curatedSourceMatches("sintel", "https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd")).toBe(true);
    expect(curatedSourceMatches("caminandes-1", "https://example.com/sintel.mp4")).toBe(false);
  });
});
