import { describe, expect, it } from 'vitest';
import { parseCinejoyCatalogue } from '../src/lib/aggregators/cinejoy';

describe('Cinejoy public catalogue parser', () => {
  const card = '<a href="/movie/27205-inception-2010"><img alt="Inception" src="https://image.tmdb.org/t/p/w500/poster.jpg"></a>';
  it('imports identity and artwork, not fictional playable sources', () => {
    const [movie] = parseCinejoyCatalogue(card);
    expect(movie.name).toBe('Inception');
    expect(movie.year).toBe(2010);
    expect(movie.sources).toEqual([]);
    expect(movie.availability[0].url).toBe('https://cinejoy.pk/movie/27205-inception-2010');
  });
  it('deduplicates cards and separates TV from movie identifiers', () => {
    const items = parseCinejoyCatalogue(card + card + '<a href="/series/27205-example-2020"><img alt="Example"></a>');
    expect(items).toHaveLength(2);
    expect(items[1].kind).toBe('series');
  });
  it('rejects foreign links, missing years and untrusted images', () => {
    expect(parseCinejoyCatalogue('<a href="https://evil.test/movie/2-example-2020">Bad</a><a href="/movie/1-example">Bad</a>')).toEqual([]);
    expect(parseCinejoyCatalogue(card.replace('https://image.tmdb.org', 'http://evil.test'))[0].posterUrl).toBeUndefined();
  });
});
