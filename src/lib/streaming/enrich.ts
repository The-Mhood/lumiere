import type { TitleDetail } from '../content';
import { playbackIdentity } from './identity';
import { getResolver } from './providers';
/** Playback URLs are short-lived response data, never catalogue DB writes. */
export async function withResolvedSources(record: TitleDetail): Promise<TitleDetail> {
  const title = structuredClone(record);
  const resolver = await getResolver();
  const match = playbackIdentity(title);
  if (title.kind === 'movie') title.sources = (await resolver.resolve(match)).sources;
  else await Promise.all(title.seasons.flatMap((s) => s.episodes).map(async (episode) => {
    episode.sources = (await resolver.resolve(playbackIdentity(title, episode.id))).sources;
  }));
  return title;
}
