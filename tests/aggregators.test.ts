import "dotenv/config";
import { afterAll, describe, expect, it, vi } from "vitest";
import { bayesianRating } from "@/lib/aggregators/internet-archive";
import { slugify, ADAPTERS, getAdapter, runAggregation } from "@/lib/aggregators";
import { db, closeDb } from "@/db";
import { eq } from "drizzle-orm";
import { availability, titles } from "@/db/schema";

afterAll(() => closeDb());

describe("aggregator normalisation", () => {
  it("dampens sparse 5-star ratings toward the prior", () => {
    expect(bayesianRating(5, 1)).toBeLessThan(8);
    expect(bayesianRating(5, 500)).toBeGreaterThan(9.5);
    expect(bayesianRating(undefined, undefined)).toBe(6.8);
  });
  it("slugifies unicode titles safely", () => {
    expect(slugify("Das Kabinett des Doktor Caligari (1919)")).toBe("das-kabinett-des-doktor-caligari-1919");
    expect(slugify("Amélie!!")).toBe("amelie");
  });
  it("registers adapters and reports configuration", () => {
    expect(ADAPTERS.map((a) => a.key)).toEqual(["internet-archive", "tmdb"]);
    expect(getAdapter("internet-archive")!.configured()).toBe(true);
    expect(getAdapter("nope")).toBeNull();
  });
});

describe("aggregated catalogue (after sync)", () => {
  it("imported Internet Archive titles with free availability and authorized sources", async () => {
    const adapter = getAdapter("internet-archive")!;
    const fetch = vi.spyOn(adapter, "fetchCatalogue").mockResolvedValue([{
      externalSource: "internet-archive", externalId: "fixture-film", kind: "movie",
      name: "Fixture Film", synopsis: "Deterministic import fixture", year: 1920,
      country: "US", rating: 7, voteCount: 10, popularity: 1, license: "Public domain",
      genres: ["Drama"], sources: [{ providerSlug: adapter.providers[0].slug,
        label: "Archive", url: "https://archive.org/download/fixture/film.mp4", format: "mp4", resolutions: ["480p"] }],
      availability: [{ platform: "Internet Archive", platformSlug: "internet-archive", kind: "free", url: "https://archive.org/details/fixture" }],
    }]);
    try {
      const run = await runAggregation("internet-archive", 1);
      expect(run.errors).toEqual([]);
      expect(run.imported).toBe(1);
    } finally { fetch.mockRestore(); }
    const rows = await db.select().from(titles).where(eq(titles.externalSource, "internet-archive")).limit(5);
    expect(rows.length).toBeGreaterThan(0);
    const avail = await db.select().from(availability).where(eq(availability.titleId, rows[0].id));
    expect(avail.some((a) => a.platformSlug === "internet-archive" && a.kind === "free")).toBe(true);
    const { getTitleBySlug } = await import("@/lib/content");
    const detail = await getTitleBySlug(rows[0].slug);
    expect(detail!.sources.length).toBeGreaterThan(0);
    expect(detail!.sources.every((s) => s.url.startsWith("https://archive.org/download/"))).toBe(true);
  });
});
