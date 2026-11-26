import { describe, expect, it } from "vitest";
import { detectFormat, hostAllowed, isSourcePlayable, rankSources, type SourceRecord } from "@/lib/streaming";

const provider = { slug: "p", name: "P", authorized: true, allowedHosts: ["cdn.example.com", "*.akamaized.net"], priority: 10 };
const base: SourceRecord = {
  id: 1, label: "A", url: "https://cdn.example.com/a.m3u8", format: "hls", resolutions: ["720p", "1080p"],
  audioLanguages: ["en"], subtitleLanguages: [], subtitles: [], status: "online", priority: 1, provider,
};

describe("format detection", () => {
  it("detects hls/dash/mp4 by manifest extension", () => {
    expect(detectFormat("https://x.com/a.m3u8")).toBe("hls");
    expect(detectFormat("https://x.com/a/.mpd")).toBe("dash");
    expect(detectFormat("https://x.com/a.MP4?x=1")).toBe("mp4");
    expect(detectFormat("https://x.com/a.avi")).toBeNull();
    expect(detectFormat("not a url")).toBeNull();
  });
});

describe("provider authorization", () => {
  it("only allows https hosts on the allow-list (with wildcards)", () => {
    expect(hostAllowed("https://cdn.example.com/x.mpd", provider.allowedHosts)).toBe(true);
    expect(hostAllowed("https://dash.akamaized.net/x.mpd", provider.allowedHosts)).toBe(true);
    expect(hostAllowed("http://cdn.example.com/x.mpd", provider.allowedHosts)).toBe(false);
    expect(hostAllowed("https://evil.com/x.mpd", provider.allowedHosts)).toBe(false);
  });
  it("rejects unauthorized providers, host mismatches, format mismatches and offline sources", () => {
    expect(isSourcePlayable(base)).toBe(true);
    expect(isSourcePlayable({ ...base, provider: { ...provider, authorized: false } })).toBe(false);
    expect(isSourcePlayable({ ...base, url: "https://other.com/a.m3u8" })).toBe(false);
    expect(isSourcePlayable({ ...base, format: "dash" })).toBe(false);
    expect(isSourcePlayable({ ...base, status: "offline" })).toBe(false);
  });
});

describe("source ranking", () => {
  it("prefers healthy sources, then provider priority, then resolution", () => {
    const ranked = rankSources([
      { ...base, id: 1, status: "degraded" },
      { ...base, id: 2, status: "online", provider: { ...provider, priority: 50 } },
      { ...base, id: 3, status: "online", resolutions: ["2160p"] , priority: 1 },
      { ...base, id: 4, status: "online", resolutions: ["480p"], priority: 1 },
      { ...base, id: 5, status: "offline" },
    ]);
    expect(ranked.map((r) => r.id)).toEqual([3, 4, 2, 1]);
  });
});
