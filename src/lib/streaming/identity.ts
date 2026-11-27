import type { TitleDetail } from '../content';
import type { TitleMatch } from './resolver';

/** External identities, not DB primary keys, are sent to remote scrapers. */
export function playbackIdentity(title: TitleDetail, episodeId?: number): TitleMatch {
  const external = ['tmdb', 'cinejoy'].includes(title.externalSource ?? '')
    ? title.externalId?.match(/^(?:(movie|series|tv):)?([1-9]\d*)$/) : null;
  const typeMatches = !external?.[1] || (title.kind === 'movie' ? external[1] === 'movie' : ['series', 'tv'].includes(external[1]));
  const tmdbId = external && typeMatches ? Number(external[2]) : undefined;
  const season = title.seasons.find(s => s.episodes.some(e => e.id === episodeId));
  const episode = season?.episodes.find(e => e.id === episodeId);
  return {
    slug: title.slug, name: title.name, year: title.year, kind: title.kind,
    ...(tmdbId && Number.isSafeInteger(tmdbId) ? { tmdbId } : {}),
    ...(episode ? { episodeId: episode.id, episodeName: episode.name, seasonNumber: season!.number, episodeNumber: episode.number } : {}),
  };
}
