import type { LumiereDb } from "./index";
import {
  credits,
  episodes,
  genres,
  people,
  providers,
  seasons,
  sources,
  titleGenres,
  titles,
} from "./schema";
import { curatedSourceMatches } from "../lib/streaming/curated-matches";

/**
 * Catalogue seed. Every title here is openly licensed (Creative Commons
 * Attribution – Blender Foundation open movies) and every source points at an
 * authorized public demo CDN. Posters are original generated artwork.
 */

const GENRES = [
  "Animation", "Adventure", "Comedy", "Fantasy", "Sci-Fi", "Drama", "Action", "Horror", "Family", "Short",
];

const PROVIDERS = [
  { slug: "akamai-dash", name: "Akamai CDN", allowedHosts: ["dash.akamaized.net"], priority: 10 },
  { slug: "mux-test", name: "Mux Streams", allowedHosts: ["test-streams.mux.dev"], priority: 20 },
  { slug: "bitmovin", name: "Bitmovin Edge", allowedHosts: ["bitmovin-a.akamaihd.net", "bitdash-a.akamaihd.net"], priority: 30 },
  { slug: "unified", name: "Unified Streaming", allowedHosts: ["demo.unified-streaming.com"], priority: 40 },
  { slug: "shaka-assets", name: "Shaka Demo CDN", allowedHosts: ["storage.googleapis.com"], priority: 50 },
  { slug: "gcs-direct", name: "Internet Archive", allowedHosts: ["archive.org", "*.archive.org"], priority: 90 },
  { slug: "blender-cdn", name: "Blender CDN", allowedHosts: ["download.blender.org", "*.blender.org"], priority: 60 },
  // Example of a de-authorized provider: its sources must never be shown.
  { slug: "legacy-mirror", name: "Legacy Mirror", allowedHosts: ["legacy.example.com"], priority: 200, authorized: false },
];

type Src = {
  provider: string;
  label: string;
  url: string;
  format: "hls" | "dash" | "mp4";
  resolutions: string[];
  audio?: string[];
  subs?: string[];
  subtitles?: { lang: string; label: string; url: string }[];
  priority?: number;
};

type Seed = {
  slug: string;
  kind: "movie" | "series";
  name: string;
  originalName?: string;
  tagline?: string;
  synopsis: string;
  year: number;
  releaseDate: string;
  runtime?: number;
  country: string;
  language?: string;
  rating: number;
  votes: number;
  popularity: number;
  poster?: string;
  trailer?: string;
  maxQuality: string;
  featured?: boolean;
  genres: string[];
  cast: { name: string; character: string }[];
  crew: { name: string; role: "director" | "writer" | "producer" }[];
  sources: Src[];
  seasons?: {
    number: number;
    name: string;
    episodes: { number: number; name: string; overview: string; runtime: number; airDate: string; sources: Src[] }[];
  }[];
};

const BBB_MP4 = "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4";

const TITLES: Seed[] = [
  {
    slug: "big-buck-bunny",
    kind: "movie",
    name: "Big Buck Bunny",
    originalName: "Big Buck Bunny",
    tagline: "A giant rabbit with a heart bigger than himself.",
    synopsis:
      "A gentle, oversized rabbit wakes to a beautiful spring morning — until three bullying rodents cruelly kill two of his butterfly friends. Pushed too far, Bunny sets aside his peaceful nature and hatches an elaborate, slapstick plan for revenge.",
    year: 2008,
    releaseDate: "2008-04-10",
    runtime: 10,
    country: "Netherlands",
    rating: 8.1,
    votes: 3421,
    popularity: 98,
    poster: "/posters/big-buck-bunny.jpg",
    trailer: BBB_MP4,
    maxQuality: "2160p",
    featured: true,
    genres: ["Animation", "Comedy", "Family", "Short"],
    cast: [
      { name: "Big Buck Bunny", character: "Bunny" },
      { name: "Frank", character: "Flying Squirrel" },
      { name: "Rinky", character: "Red Squirrel" },
      { name: "Gamera", character: "Chinchilla" },
    ],
    crew: [
      { name: "Sacha Goedegebure", role: "director" },
      { name: "Sacha Goedegebure", role: "writer" },
      { name: "Ton Roosendaal", role: "producer" },
    ],
    sources: [
      {
        provider: "akamai-dash",
        label: "Server 1 · 4K DASH",
        url: "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd",
        format: "dash",
        resolutions: ["320p", "480p", "720p", "1080p", "2160p"],
        priority: 1,
      },
      {
        provider: "mux-test",
        label: "Server 2 · HLS",
        url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        format: "hls",
        resolutions: ["240p", "360p", "480p", "720p", "1080p"],
        priority: 2,
      },
      {
        provider: "gcs-direct",
        label: "Server 3 · MP4 (Archive)",
        url: BBB_MP4,
        format: "mp4",
        resolutions: ["720p"],
        priority: 3,
      },
      {
        provider: "legacy-mirror",
        label: "Unauthorized mirror",
        url: "https://legacy.example.com/bbb.m3u8",
        format: "hls",
        resolutions: ["1080p"],
      },
    ],
  },
  {
    slug: "sintel",
    kind: "movie",
    name: "Sintel",
    originalName: "Sintel",
    tagline: "A lonely young woman. A lost dragon. A journey across a broken world.",
    synopsis:
      "Sintel, a lonely young woman, forms a bond with a wounded baby dragon she names Scales. When Scales is snatched away by an adult dragon, she sets out on a perilous quest across mountains and ruins, growing harder with every step — unaware of what her search will cost her.",
    year: 2010,
    releaseDate: "2010-09-27",
    runtime: 15,
    country: "Netherlands",
    rating: 7.9,
    votes: 2980,
    popularity: 95,
    poster: "/posters/sintel.jpg",
    trailer: "https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4",
    maxQuality: "1440p",
    featured: true,
    genres: ["Animation", "Fantasy", "Adventure", "Drama"],
    cast: [
      { name: "Halina Reijn", character: "Sintel (voice)" },
      { name: "Thom Hoffman", character: "Shaman (voice)" },
    ],
    crew: [
      { name: "Colin Levy", role: "director" },
      { name: "Esther Wouda", role: "writer" },
      { name: "Ton Roosendaal", role: "producer" },
    ],
    sources: [
      {
        provider: "shaka-assets",
        label: "Server 1 · UHD DASH",
        url: "https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd",
        format: "dash",
        resolutions: ["272p", "364p", "546p", "818p", "1090p", "1636p"],
        priority: 1,
      },
      {
        provider: "shaka-assets",
        label: "Server 2 · DASH + Subtitles",
        url: "https://storage.googleapis.com/shaka-demo-assets/sintel-mp4-wvtt/dash.mpd",
        format: "dash",
        resolutions: ["272p", "364p", "546p", "818p", "1090p"],
        subs: ["en", "de", "es", "fr", "it", "nl", "pl", "pt", "ru"],
        priority: 2,
      },
      {
        provider: "gcs-direct",
        label: "Server 3 · MP4",
        url: "https://archive.org/download/Sintel/sintel-2048-surround.mp4",
        format: "mp4",
        resolutions: ["720p"],
        priority: 3,
      },
    ],
  },
  {
    slug: "tears-of-steel",
    kind: "movie",
    name: "Tears of Steel",
    originalName: "Tears of Steel",
    tagline: "The future of Amsterdam depends on one broken heart.",
    synopsis:
      "Forty years after a painful breakup, a group of warriors and scientists gather at the Oude Kerk in a ruined Amsterdam to stage a critical event from the past, in a desperate attempt to rescue the world from destructive robots.",
    year: 2012,
    releaseDate: "2012-09-26",
    runtime: 12,
    country: "Netherlands",
    rating: 7.4,
    votes: 2210,
    popularity: 90,
    poster: "/posters/tears-of-steel.jpg",
    trailer: "https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov",
    maxQuality: "1080p",
    featured: true,
    genres: ["Sci-Fi", "Action", "Drama", "Short"],
    cast: [
      { name: "Derek de Lint", character: "Old Thom" },
      { name: "Sergio Hasselbaink", character: "Barley" },
      { name: "Rogier Schippers", character: "Thom" },
      { name: "Vanja Rukavina", character: "Celia" },
    ],
    crew: [
      { name: "Ian Hubert", role: "director" },
      { name: "Ian Hubert", role: "writer" },
      { name: "Ton Roosendaal", role: "producer" },
    ],
    sources: [
      {
        provider: "unified",
        label: "Server 1 · DASH",
        url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.mpd",
        format: "dash",
        resolutions: ["360p", "480p", "720p", "1080p"],
        audio: ["en"],
        subs: ["en", "de", "es", "fr", "nl", "ru"],
        priority: 1,
      },
      {
        provider: "unified",
        label: "Server 2 · HLS",
        url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
        format: "hls",
        resolutions: ["360p", "480p", "720p", "1080p"],
        subs: ["en", "de", "es", "fr", "nl", "ru"],
        priority: 2,
      },
      {
        provider: "shaka-assets",
        label: "Server 3 · DASH + TTML subs",
        url: "https://storage.googleapis.com/shaka-demo-assets/tos-ttml/dash.mpd",
        format: "dash",
        resolutions: ["360p", "480p", "720p", "1080p"],
        subs: ["en"],
        priority: 3,
      },
    ],
  },
  {
    slug: "elephants-dream",
    kind: "movie",
    name: "Elephants Dream",
    originalName: "Elephants Dream",
    tagline: "Welcome to the Machine.",
    synopsis:
      "Proog and Emo inhabit a vast, surreal machine. Proog, the elder, acts as guide and protector, insisting on the beauty and danger of their world; Emo, the younger, grows ever more skeptical — until their disagreement about the nature of reality turns violent.",
    year: 2006,
    releaseDate: "2006-03-24",
    runtime: 11,
    country: "Netherlands",
    rating: 6.9,
    votes: 1890,
    popularity: 80,
    poster: "/posters/elephants-dream.jpg",
    trailer: "https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4",
    maxQuality: "1080p",
    genres: ["Animation", "Sci-Fi", "Drama", "Short"],
    cast: [
      { name: "Tygo Gernandt", character: "Proog (voice)" },
      { name: "Cas Jansen", character: "Emo (voice)" },
    ],
    crew: [
      { name: "Bassam Kurdali", role: "director" },
      { name: "Bassam Kurdali", role: "writer" },
      { name: "Ton Roosendaal", role: "producer" },
    ],
    sources: [
      {
        provider: "akamai-dash",
        label: "Server 1 · DASH + Subtitles",
        url: "https://dash.akamaized.net/akamai/test/caption_test/ElephantsDream/elephants_dream_480p_heaac5_1.mpd",
        format: "dash",
        resolutions: ["480p"],
        subs: ["en", "sv"],
        priority: 1,
      },
      {
        provider: "gcs-direct",
        label: "Server 2 · MP4",
        url: "https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4",
        format: "mp4",
        resolutions: ["720p"],
        priority: 2,
      },
    ],
  },
  {
    slug: "cosmos-laundromat",
    kind: "movie",
    name: "Cosmos Laundromat: First Cycle",
    originalName: "Cosmos Laundromat",
    tagline: "Every life has a cycle.",
    synopsis:
      "On a desolate island, a suicidal sheep named Franck meets his fate in the form of Victor, a quirky salesman who offers him the gift of a lifetime: the chance to live any life he wants.",
    year: 2015,
    releaseDate: "2015-08-10",
    runtime: 12,
    country: "Netherlands",
    rating: 7.2,
    votes: 1320,
    popularity: 77,
    poster: "/posters/cosmos-laundromat.jpg",
    maxQuality: "1080p",
    genres: ["Animation", "Fantasy", "Comedy", "Short"],
    cast: [
      { name: "Pierre Bokma", character: "Victor (voice)" },
      { name: "Reinout Scholten van Aschat", character: "Franck (voice)" },
    ],
    crew: [
      { name: "Mathieu Auvray", role: "director" },
      { name: "Esther Wouda", role: "writer" },
      { name: "Ton Roosendaal", role: "producer" },
    ],
    sources: [
      {
        provider: "shaka-assets",
        label: "Server 1 · DASH (multi-audio)",
        url: "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd",
        format: "dash",
        resolutions: ["360p", "480p", "720p", "1080p"],
        audio: ["en", "de", "fr", "es"],
        subs: ["en", "de", "fr", "es", "it"],
        priority: 1,
      },
      {
        provider: "shaka-assets",
        label: "Server 2 · HLS (multi-audio)",
        url: "https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8",
        format: "hls",
        resolutions: ["360p", "480p", "720p", "1080p"],
        audio: ["en", "de", "fr", "es"],
        subs: ["en", "de", "fr", "es", "it"],
        priority: 2,
      },
    ],
  },
  {
    slug: "spring",
    kind: "movie",
    name: "Spring",
    tagline: "The old seasons must make way for the new.",
    synopsis:
      "A shepherd girl and her dog face ancient spirits in order to continue the cycle of life. A poetic, dialogue-free fable about the turning of the seasons high in the mountains.",
    year: 2019,
    releaseDate: "2019-04-04",
    runtime: 8,
    country: "Netherlands",
    rating: 7.6,
    votes: 980,
    popularity: 70,
    poster: "/posters/spring.jpg",
    maxQuality: "2160p",
    genres: ["Animation", "Fantasy", "Family", "Short"],
    cast: [{ name: "Andy Goralczyk", character: "Spirit designs" }],
    crew: [
      { name: "Andy Goralczyk", role: "director" },
      { name: "Andy Goralczyk", role: "writer" },
      { name: "Francesco Siddi", role: "producer" },
    ],
    sources: [
      {
        provider: "akamai-dash",
        label: "Server 1 · 4K DASH",
        url: "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd",
        format: "dash",
        resolutions: ["320p", "480p", "720p", "1080p", "2160p"],
        priority: 1,
      },
      {
        provider: "shaka-assets",
        label: "Server 2 · HLS",
        url: "https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths-hls/hls.m3u8",
        format: "hls",
        resolutions: ["360p", "480p", "720p", "1080p"],
        priority: 2,
      },
    ],
  },
  {
    slug: "agent-327-operation-barbershop",
    kind: "movie",
    name: "Agent 327: Operation Barbershop",
    originalName: "Agent 327",
    tagline: "A close shave with danger.",
    synopsis:
      "Agent 327 is investigating a clue that leads him to a shady barbershop in Amsterdam. Little does he know that he is being tailed by mercenary Boris Kloris — and that the barber's chair holds more than a haircut.",
    year: 2017,
    releaseDate: "2017-05-15",
    runtime: 4,
    country: "Netherlands",
    rating: 7.3,
    votes: 1105,
    popularity: 68,
    poster: "/posters/agent-327.jpg",
    maxQuality: "1080p",
    genres: ["Animation", "Action", "Comedy", "Short"],
    cast: [
      { name: "Agent 327", character: "Agent 327" },
      { name: "Boris Kloris", character: "Boris Kloris" },
    ],
    crew: [
      { name: "Hjalti Hjálmarsson", role: "director" },
      { name: "Colin Levy", role: "director" },
      { name: "Martin Lodewijk", role: "writer" },
    ],
    sources: [
      {
        provider: "blender-cdn",
        label: "Server 1 · MP4",
        url: "https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4",
        format: "mp4",
        resolutions: ["720p"],
        priority: 1,
      },
      {
        provider: "gcs-direct",
        label: "Server 2 · MP4",
        url: "https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4",
        format: "mp4",
        resolutions: ["720p"],
        priority: 2,
      },
    ],
  },
  {
    slug: "sprite-fright",
    kind: "movie",
    name: "Sprite Fright",
    tagline: "Don't pick the mushrooms.",
    synopsis:
      "In a 1980s-inspired horror comedy, a group of rowdy teenagers trek into an isolated forest and discover peaceful mushroom creatures that turn out to be an unexpected force of nature.",
    year: 2021,
    releaseDate: "2021-10-29",
    runtime: 11,
    country: "Netherlands",
    rating: 7.0,
    votes: 870,
    popularity: 74,
    poster: "/posters/sprite-fright.jpg",
    maxQuality: "2160p",
    genres: ["Animation", "Horror", "Comedy", "Short"],
    cast: [
      { name: "Ellie", character: "Ellie" },
      { name: "Phil", character: "Phil" },
      { name: "Rex", character: "Rex" },
    ],
    crew: [
      { name: "Matthew Luhn", role: "director" },
      { name: "Hjalti Hjálmarsson", role: "director" },
      { name: "Francesco Siddi", role: "producer" },
    ],
    sources: [
      {
        provider: "akamai-dash",
        label: "Server 1 · 4K DASH",
        url: "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd",
        format: "dash",
        resolutions: ["320p", "480p", "720p", "1080p", "2160p"],
        priority: 1,
      },
      {
        provider: "gcs-direct",
        label: "Server 2 · MP4",
        url: "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
        format: "mp4",
        resolutions: ["720p"],
        priority: 2,
      },
    ],
  },
  {
    slug: "charge",
    kind: "movie",
    name: "Charge",
    tagline: "In a world without power, one man holds the spark.",
    synopsis:
      "In a dark and frozen future where energy is the only currency, a lone scavenger finds a battery that could change everything — if he can survive the machines hunting it.",
    year: 2022,
    releaseDate: "2022-12-16",
    runtime: 4,
    country: "Netherlands",
    rating: 7.1,
    votes: 640,
    popularity: 66,
    poster: "/posters/charge.jpg",
    maxQuality: "2160p",
    genres: ["Animation", "Sci-Fi", "Action", "Short"],
    cast: [{ name: "The Scavenger", character: "Scavenger" }],
    crew: [
      { name: "Hjalti Hjálmarsson", role: "director" },
      { name: "Francesco Siddi", role: "producer" },
    ],
    sources: [
      {
        provider: "unified",
        label: "Server 1 · DASH",
        url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.mpd",
        format: "dash",
        resolutions: ["360p", "480p", "720p", "1080p"],
        subs: ["en", "de", "es", "fr", "nl", "ru"],
        priority: 1,
      },
      {
        provider: "gcs-direct",
        label: "Server 2 · MP4",
        url: "https://archive.org/download/Sintel/sintel-2048-surround.mp4",
        format: "mp4",
        resolutions: ["720p"],
        priority: 2,
      },
    ],
  },
  {
    slug: "caminandes",
    kind: "series",
    name: "Caminandes",
    originalName: "Caminandes",
    tagline: "One llama. Endless trouble.",
    synopsis:
      "Follow Koro the llama through the wilds of Patagonia as he gets into escalating trouble with fences, penguins, and the local wildlife in this slapstick animated series.",
    year: 2013,
    releaseDate: "2013-09-27",
    country: "Argentina",
    rating: 7.5,
    votes: 1540,
    popularity: 85,
    poster: "/posters/caminandes.jpg",
    maxQuality: "1080p",
    featured: true,
    genres: ["Animation", "Comedy", "Family", "Adventure"],
    cast: [
      { name: "Koro", character: "Koro the Llama" },
      { name: "Oti", character: "Oti the Penguin" },
    ],
    crew: [
      { name: "Pablo Vazquez", role: "director" },
      { name: "Pablo Vazquez", role: "writer" },
      { name: "Francesco Siddi", role: "producer" },
    ],
    sources: [],
    seasons: [
      {
        number: 1,
        name: "Season 1",
        episodes: [
          {
            number: 1,
            name: "Llama Drama",
            overview: "Koro the llama wants to cross the road. A truck, a fence, and gravity have other ideas.",
            runtime: 2,
            airDate: "2013-09-27",
            sources: [
              { provider: "blender-cdn", label: "Server 1 · MP4", url: "https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4", format: "mp4", resolutions: ["720p"], priority: 1 },
              { provider: "mux-test", label: "Server 2 · HLS", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", format: "hls", resolutions: ["240p", "360p", "480p", "720p", "1080p"], priority: 2 },
            ],
          },
          {
            number: 2,
            name: "Gran Dillama",
            overview: "Koro spots the greenest grass he's ever seen — on the wrong side of an electric fence.",
            runtime: 3,
            airDate: "2013-11-22",
            sources: [
              { provider: "gcs-direct", label: "Server 1 · MP4", url: "https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4", format: "mp4", resolutions: ["720p"], priority: 1 },
              { provider: "akamai-dash", label: "Server 2 · 4K DASH", url: "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd", format: "dash", resolutions: ["480p", "720p", "1080p", "2160p"], priority: 2 },
            ],
          },
          {
            number: 3,
            name: "Llamigos",
            overview: "On a freezing winter night, Koro and a tiny penguin fight over the last berry in Patagonia.",
            runtime: 3,
            airDate: "2016-01-30",
            sources: [
              { provider: "gcs-direct", label: "Server 1 · MP4", url: "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4", format: "mp4", resolutions: ["720p"], priority: 1 },
              { provider: "shaka-assets", label: "Server 2 · HLS", url: "https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths-hls/hls.m3u8", format: "hls", resolutions: ["360p", "720p", "1080p"], priority: 2 },
            ],
          },
        ],
      },
      {
        number: 2,
        name: "Season 2",
        episodes: [
          {
            number: 1,
            name: "Bullrun",
            overview: "Koro accidentally joins a cross-country rally. Nobody told the drivers.",
            runtime: 3,
            airDate: "2017-03-12",
            sources: [
              { provider: "gcs-direct", label: "Server 1 · MP4", url: "https://archive.org/download/Sintel/sintel-2048-surround.mp4", format: "mp4", resolutions: ["720p"], priority: 1 },
            ],
          },
          {
            number: 2,
            name: "A Grand Llama",
            overview: "Koro discovers money. It does not go well.",
            runtime: 3,
            airDate: "2017-04-02",
            sources: [
              { provider: "blender-cdn", label: "Server 1 · MP4", url: "https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4", format: "mp4", resolutions: ["720p"], priority: 1 },
              { provider: "shaka-assets", label: "Server 2 · DASH (multi-audio)", url: "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd", format: "dash", resolutions: ["360p", "720p", "1080p"], audio: ["en", "de", "fr", "es"], subs: ["en", "de", "fr", "es"], priority: 2 },
            ],
          },
        ],
      },
    ],
  },
];

/** Insert the curated catalogue. Exported so tests can seed an empty DB. */
export async function seedDatabase(db: LumiereDb) {
  // Explicit reset is confined to the CLI. Startup only calls this on an
  // empty catalogue; never truncate user data as a side effect of first boot.


  const genreRows = await db
    .insert(genres)
    .values(GENRES.map((g) => ({ slug: g.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: g })))
    .returning();
  const genreId = new Map(genreRows.map((g) => [g.name, g.id]));

  const providerRows = await db
    .insert(providers)
    .values(PROVIDERS.map((p) => ({ ...p, authorized: p.authorized ?? true })))
    .returning();
  const providerId = new Map(providerRows.map((p) => [p.slug, p.id]));

  const personId = new Map<string, number>();
  async function person(name: string) {
    if (personId.has(name)) return personId.get(name)!;
    const [row] = await db.insert(people).values({ name }).returning();
    personId.set(name, row.id);
    return row.id;
  }

  const mapSource = (s: Src, titleId: number | null, episodeId: number | null) => ({
    providerId: providerId.get(s.provider)!,
    titleId,
    episodeId,
    label: s.label,
    url: s.url,
    format: s.format,
    resolutions: s.resolutions,
    audioLanguages: s.audio ?? ["en"],
    subtitleLanguages: s.subs ?? [],
    subtitles: s.subtitles ?? [],
    status: "unknown" as const,
    priority: s.priority ?? 100,
  });

  for (const [i, t] of TITLES.entries()) {
    const [row] = await db
      .insert(titles)
      .values({
        slug: t.slug,
        kind: t.kind,
        name: t.name,
        originalName: t.originalName ?? t.name,
        tagline: t.tagline,
        synopsis: t.synopsis,
        year: t.year,
        releaseDate: t.releaseDate,
        runtimeMinutes: t.runtime,
        country: t.country,
        language: t.language ?? "en",
        rating: t.rating,
        voteCount: t.votes,
        popularity: t.popularity,
        posterUrl: t.poster,
        backdropUrl: t.poster,
        trailerUrl: t.trailer,
        license: "CC BY 3.0 — Blender Foundation",
        maxQuality: t.maxQuality,
        featured: t.featured ?? false,
        createdAt: new Date(Date.now() - (TITLES.length - i) * 86400000),
      })
      .returning();

    await db.insert(titleGenres).values(t.genres.map((g) => ({ titleId: row.id, genreId: genreId.get(g)! })));

    let order = 0;
    for (const c of t.cast) {
      await db.insert(credits).values({ titleId: row.id, personId: await person(c.name), role: "cast", character: c.character, order: order++ });
    }
    for (const c of t.crew) {
      await db.insert(credits).values({ titleId: row.id, personId: await person(c.name), role: c.role, order: order++ });
    }
    const matching = t.sources.filter((source) => curatedSourceMatches(t.slug, source.url));
    if (matching.length) await db.insert(sources).values(matching.map((s) => mapSource(s, row.id, null)));

    for (const s of t.seasons ?? []) {
      const [season] = await db.insert(seasons).values({ titleId: row.id, number: s.number, name: s.name }).returning();
      for (const e of s.episodes) {
        const [ep] = await db
          .insert(episodes)
          .values({
            seasonId: season.id,
            titleId: row.id,
            number: e.number,
            name: e.name,
            overview: e.overview,
            runtimeMinutes: e.runtime,
            airDate: e.airDate,
            stillUrl: t.poster,
          })
          .returning();
        // Earlier fixtures used unrelated films as episode sources. Keep
        // the episode metadata, but never misrepresent those as playback.
        const matching = e.sources.filter((source) => curatedSourceMatches(`${t.slug}-${e.number}`, source.url));
        if (matching.length) await db.insert(sources).values(matching.map((src) => mapSource(src, null, ep.id)));
      }
    }
  }
  console.log(`Seeded ${TITLES.length} titles.`);
}

