import type { TitleDetail } from '../content';
import { getResolver } from './providers';
/** Playback URLs are short-lived response data, never catalogue DB writes. */
export async function withResolvedSources(record: TitleDetail): Promise<TitleDetail> {
  const title = structuredClone(record);
  const resolver = await getResolver();
  const match = { slug: title.slug, name: title.name, year: title.year, kind: title.kind };
  if (title.kind === 'movie') title.sources = (await resolver.resolve(match)).sources;
  else await Promise.all(title.seasons.flatMap((s) => s.episodes).map(async (episode) => {
    episode.sources = (await resolver.resolve({ ...match, episodeId: episode.id, episodeName: episode.name })).sources;
  }));
  return title;
}
