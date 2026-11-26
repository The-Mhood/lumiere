/** Known curated-film URL identities. Previously seeded unrelated demo films
 * must not be used as fallbacks. This also protects existing installations. */
export function curatedSourceMatches(slug: string, url: string): boolean {
  const patterns: Record<string, RegExp> = {
    "big-buck-bunny": /\/bbb_30fps\/|\/BigBuckBunny_124\/|\/x36xhzz\//i,
    sintel: /\/sintel(?:\/|-mp4-wvtt\/)|\/Sintel\//i,
    "tears-of-steel": /\/tears-of-steel\/|\/tos-ttml\//i,
    "elephants-dream": /\/ElephantsDream\//i,
  };
  const unavailable = ["cosmos-laundromat", "spring", "agent-327", "agent-327-operation-barbershop", "sprite-fright", "charge"];
  if (unavailable.includes(slug) || slug.startsWith("caminandes")) return false;
  return patterns[slug] ? patterns[slug].test(url) : true;
}
