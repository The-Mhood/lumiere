import { describe, expect, it, vi } from "vitest";
import { SourceResolver, type ProviderAdapter, type TitleMatch } from "./resolver";

const title: TitleMatch = {
  slug: "example-film",
  name: "Example Film",
  year: 2024,
  kind: "movie",
};

describe("SourceResolver provider extensions", () => {
  it("supports a playback-only adapter without a catalogue search method", async () => {
    const resolve = vi.fn(async () => []);
    const adapter: ProviderAdapter = {
      id: "senior-integration-slot",
      priority: 10,
      resolve,
    };
    const resolver = new SourceResolver([adapter]);

    await expect(resolver.search("Example Film")).resolves.toEqual([]);
    const result = await resolver.resolve(title);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(title, expect.any(AbortSignal));
    expect(result.sources).toEqual([]);
    expect(result.reports).toEqual([
      expect.objectContaining({
        provider: "senior-integration-slot",
        status: "unavailable",
        attempts: 1,
      }),
    ]);
  });
});
