import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  real,
  primaryKey,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

export const titles = pgTable(
  "titles",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    kind: text("kind", { enum: ["movie", "series"] }).notNull(),
    name: text("name").notNull(),
    originalName: text("original_name"),
    tagline: text("tagline"),
    synopsis: text("synopsis").notNull(),
    year: integer("year").notNull(),
    releaseDate: text("release_date"),
    runtimeMinutes: integer("runtime_minutes"),
    country: text("country").notNull(),
    language: text("language").notNull().default("en"),
    rating: real("rating").notNull().default(0),
    voteCount: integer("vote_count").notNull().default(0),
    popularity: real("popularity").notNull().default(0),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    trailerUrl: text("trailer_url"),
    license: text("license").notNull(),
    maxQuality: text("max_quality").notNull().default("1080p"),
    featured: boolean("featured").notNull().default(false),
    /** Aggregator that produced this title (null = curated locally). */
    externalSource: text("external_source"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("titles_external_idx").on(t.externalSource, t.externalId),
    index("titles_kind_idx").on(t.kind),
    index("titles_year_idx").on(t.year),
    index("titles_popularity_idx").on(t.popularity),
  ],
);

export const genres = pgTable("genres", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const titleGenres = pgTable(
  "title_genres",
  {
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    genreId: integer("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.titleId, t.genreId] })],
);

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

export const credits = pgTable(
  "credits",
  {
    id: serial("id").primaryKey(),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["cast", "director", "writer", "producer"] }).notNull(),
    character: text("character"),
    order: integer("order").notNull().default(0),
  },
  (t) => [index("credits_title_idx").on(t.titleId)],
);

export const seasons = pgTable(
  "seasons",
  {
    id: serial("id").primaryKey(),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name"),
    overview: text("overview"),
  },
  (t) => [uniqueIndex("seasons_title_number_idx").on(t.titleId, t.number)],
);

export const episodes = pgTable(
  "episodes",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    overview: text("overview"),
    runtimeMinutes: integer("runtime_minutes"),
    airDate: text("air_date"),
    stillUrl: text("still_url"),
  },
  (t) => [uniqueIndex("episodes_season_number_idx").on(t.seasonId, t.number)],
);

/* ------------------------------------------------------------------ */
/* Streaming providers & sources                                       */
/* ------------------------------------------------------------------ */

export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** Hostnames this provider is authorized to serve from. */
  allowedHosts: jsonb("allowed_hosts").$type<string[]>().notNull().default([]),
  authorized: boolean("authorized").notNull().default(true),
  priority: integer("priority").notNull().default(100),
});

export const sources = pgTable(
  "sources",
  {
    id: serial("id").primaryKey(),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    titleId: integer("title_id").references(() => titles.id, { onDelete: "cascade" }),
    episodeId: integer("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    format: text("format", { enum: ["hls", "dash", "mp4"] }).notNull(),
    resolutions: jsonb("resolutions").$type<string[]>().notNull().default([]),
    audioLanguages: jsonb("audio_languages").$type<string[]>().notNull().default(["en"]),
    subtitleLanguages: jsonb("subtitle_languages").$type<string[]>().notNull().default([]),
    /** External subtitle tracks (for mp4/hls sources without embedded text tracks). */
    subtitles: jsonb("subtitles")
      .$type<{ lang: string; label: string; url: string }[]>()
      .notNull()
      .default([]),
    status: text("status", { enum: ["online", "degraded", "offline", "unknown"] })
      .notNull()
      .default("unknown"),
    lastCheckedAt: timestamp("last_checked_at"),
    priority: integer("priority").notNull().default(100),
  },
  (t) => [index("sources_title_idx").on(t.titleId), index("sources_episode_idx").on(t.episodeId)],
);

/* ------------------------------------------------------------------ */
/* Cross-platform availability ("where to watch") & aggregator runs    */
/* ------------------------------------------------------------------ */

export const availability = pgTable(
  "availability",
  {
    id: serial("id").primaryKey(),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    platformSlug: text("platform_slug").notNull(),
    kind: text("kind", { enum: ["free", "subscription", "rent", "buy"] }).notNull(),
    region: text("region").notNull().default("GLOBAL"),
    url: text("url").notNull(),
    logoUrl: text("logo_url"),
    price: text("price"),
    quality: text("quality"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("availability_title_idx").on(t.titleId),
    uniqueIndex("availability_unique_idx").on(t.titleId, t.platformSlug, t.kind, t.region),
  ],
);

export const aggregatorRuns = pgTable("aggregator_runs", {
  id: serial("id").primaryKey(),
  adapter: text("adapter").notNull(),
  status: text("status", { enum: ["running", "success", "failed"] }).notNull().default("running"),
  imported: integer("imported").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errors: jsonb("errors").$type<string[]>().notNull().default([]),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});

/* ------------------------------------------------------------------ */
/* Users & library                                                     */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  preferences: jsonb("preferences")
    .$type<{ subtitleLang?: string; audioLang?: string; autoplay?: boolean }>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const watchlist = pgTable(
  "watchlist",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] })],
);

export const watchProgress = pgTable(
  "watch_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    episodeId: integer("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
    positionSeconds: real("position_seconds").notNull().default(0),
    durationSeconds: real("duration_seconds").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("progress_user_idx").on(t.userId),
    uniqueIndex("progress_user_title_episode_idx").on(t.userId, t.titleId, t.episodeId),
  ],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const titlesRelations = relations(titles, ({ many }) => ({
  genres: many(titleGenres),
  credits: many(credits),
  seasons: many(seasons),
  sources: many(sources),
}));

export const sourcesRelations = relations(sources, ({ one }) => ({
  provider: one(providers, { fields: [sources.providerId], references: [providers.id] }),
}));

export type Title = typeof titles.$inferSelect;
export type Genre = typeof genres.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type User = typeof users.$inferSelect;
export type Availability = typeof availability.$inferSelect;
export type AggregatorRun = typeof aggregatorRuns.$inferSelect;
