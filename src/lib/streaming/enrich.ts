import type { TitleDetail } from '../content';
import { playbackIdentity } from './identity';
import { getResolver } from './providers';
/** Playback URLs are short-lived response data, never catalogue DB writes. */
export async function withResolvedSources(record: TitleDetail, episodeId?: number): Promise<TitleDetail> {
  const title = structuredClone(record);
  const resolver = await getResolver();
  const match = playbackIdentity(title);
  if (title.kind === 'movie') title.sources = (await resolver.resolve(match)).sources;
  else {
    const episodes = title.seasons.flatMap(s => s.episodes);
    const selected = episodeId === undefined ? episodes[0] : episodes.find(e => e.id === episodeId);
    // Never launch hundreds of browser scrapes just to open a series detail.
    if (selected) selected.sources = (await resolver.resolve(playbackIdentity(title, selected.id))).sources;
  }
  return title;
}
