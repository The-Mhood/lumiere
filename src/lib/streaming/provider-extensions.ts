import type { ProviderAdapter } from "./resolver";

/**
 * Senior-engineering integration point.
 *
 * Register approved partner adapters in this array. The resolver, title pages,
 * player, subtitles, progress tracking, and source fallback consume the common
 * ProviderAdapter contract and do not need provider-specific changes.
 *
 * This demonstration build intentionally leaves the array empty. Do not place
 * DRM circumvention, decryption, key extraction, or access-control bypass code
 * here. Implement only an integration supplied and approved by the senior team.
 */
export const providerExtensions: ProviderAdapter[] = [];
