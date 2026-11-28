import { afterEach, describe, expect, it, vi } from "vitest";
import { internetArchiveAdapter, declaredReuseLicence } from "./internet-archive";

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

afterEach(() => vi.unstubAllGlobals());

describe("Internet Archive feature-film adapter", () => {
  it("returns full-length feature files as real direct MP4 sources", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        response: {
          docs: [{
            identifier: "feature-film-1940",
            title: "Feature Film",
            year: 1940,
            runtime: "90 min",
            downloads: 12000,
            avg_rating: 4.2,
            num_reviews: 24,
            licenseurl: "https://creativecommons.org/publicdomain/zero/1.0/",
            subject: ["Drama"],
          }],
        },
      }))
      .mockResolvedValueOnce(json({
        files: [
          { name: "feature-720.mp4", height: "720", length: "5400" },
          { name: "feature-trailer.mp4", height: "1080", length: "120" },
          { name: "feature-sample.mp4", height: "1080", length: "30" },
        ],
        metadata: { licenseurl: "https://creativecommons.org/publicdomain/zero/1.0/" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await internetArchiveAdapter.fetchCatalogue({ limit: 1, log: vi.fn() });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Feature Film");
    expect(result[0].runtimeMinutes).toBe(90);
    expect(result[0].externalSource).toBe("internet-archive");
    expect(result[0].sources).toEqual([
      expect.objectContaining({
        providerSlug: "archive-org",
        format: "mp4",
        resolutions: ["720p"],
        url: "https://archive.org/download/feature-film-1940/feature-720.mp4",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not import short clips as feature films", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        response: {
          docs: [{
            identifier: "short-clip",
            title: "Short Clip",
            year: 1940,
            runtime: "12 min",
            licenseurl: "https://creativecommons.org/publicdomain/zero/1.0/",
          }],
        },
      }))
      .mockResolvedValueOnce(json({
        files: [{ name: "clip.mp4", height: "720", length: "720" }],
        metadata: {},
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await internetArchiveAdapter.fetchCatalogue({ limit: 1, log: vi.fn() });

    expect(result).toEqual([]);
  });
  it("requires explicit permissive reuse rights instead of assuming collection membership means public domain", async () => {
    expect(declaredReuseLicence(undefined)).toBeNull();
    expect(declaredReuseLicence("https://creativecommons.org/licenses/by-nc/4.0/")).toBeNull();
    expect(declaredReuseLicence("https://creativecommons.org/licenses/by/4.0/")).toContain("Attribution 4.0");
    expect(declaredReuseLicence("http://creativecommons.org/licenses/publicdomain/")).toContain("public domain");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ response: { docs: [{ identifier: "unlicensed-feature", title: "Unlicensed Feature", runtime: "90 min" }] } }))
      .mockResolvedValueOnce(json({ files: [{ name: "feature.mp4", height: "720", length: "5400" }], metadata: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await internetArchiveAdapter.fetchCatalogue({ limit: 1, log: vi.fn() });
    expect(result).toEqual([]);
  });
});
