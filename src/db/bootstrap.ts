import { sql, type SQL } from "drizzle-orm";

/**
 * Idempotent schema bootstrap.
 *
 * `drizzle-kit push` needs a reachable PostgreSQL server. Lumière also runs
 * embedded (PGlite — see `./index.ts`), where there is no server to push to,
 * so the app creates its tables on startup with `CREATE TABLE IF NOT EXISTS`.
 * The DDL below mirrors `schema.ts` exactly (column names, types, defaults,
 * unique constraints, indexes). It is safe to run on every boot and against
 * an existing database created by `drizzle-kit push`.
 */

interface Executable {
  execute: (query: SQL) => Promise<unknown>;
}

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS titles (
    id serial PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    kind text NOT NULL,
    name text NOT NULL,
    original_name text,
    tagline text,
    synopsis text NOT NULL,
    year integer NOT NULL,
    release_date text,
    runtime_minutes integer,
    country text NOT NULL,
    language text NOT NULL DEFAULT 'en',
    rating real NOT NULL DEFAULT 0,
    vote_count integer NOT NULL DEFAULT 0,
    popularity real NOT NULL DEFAULT 0,
    poster_url text,
    backdrop_url text,
    trailer_url text,
    license text NOT NULL,
    max_quality text NOT NULL DEFAULT '1080p',
    featured boolean NOT NULL DEFAULT false,
    external_source text,
    external_id text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS genres (
    id serial PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    name text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS title_genres (
    title_id integer NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    genre_id integer NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (title_id, genre_id)
  )`,
  `CREATE TABLE IF NOT EXISTS people (
    id serial PRIMARY KEY,
    name text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS credits (
    id serial PRIMARY KEY,
    title_id integer NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    person_id integer NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    role text NOT NULL,
    character text,
    "order" integer NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS seasons (
    id serial PRIMARY KEY,
    title_id integer NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    number integer NOT NULL,
    name text,
    overview text
  )`,
  `CREATE TABLE IF NOT EXISTS episodes (
    id serial PRIMARY KEY,
    season_id integer NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    title_id integer NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    number integer NOT NULL,
    name text NOT NULL,
    overview text,
    runtime_minutes integer,
    air_date text,
    still_url text
  )`,
  `CREATE TABLE IF NOT EXISTS providers (
    id serial PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    allowed_hosts jsonb NOT NULL DEFAULT '[]'::jsonb,
    authorized boolean NOT NULL DEFAULT true,
    priority integer NOT NULL DEFAULT 100
  )`,
  `CREATE TABLE IF NOT EXISTS sources (
    id serial PRIMARY KEY,
    provider_id integer NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    title_id integer REFERENCES titles(id) ON DELETE CASCADE,
    episode_id integer REFERENCES episodes(id) ON DELETE CASCADE,
    label text NOT NULL,
    url text NOT NULL,
    format text NOT NULL,
    resolutions jsonb NOT NULL DEFAULT '[]'::jsonb,
    audio_languages jsonb NOT NULL DEFAULT '["en"]'::jsonb,
    subtitle_languages jsonb NOT NULL DEFAULT '[]'::jsonb,
    subtitles jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'unknown',
    last_checked_at timestamp,
    priority integer NOT NULL DEFAULT 100
  )`,
  `CREATE TABLE IF NOT EXISTS availability (
    id serial PRIMARY KEY,
    title_id integer NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    platform text NOT NULL,
    platform_slug text NOT NULL,
    kind text NOT NULL,
    region text NOT NULL DEFAULT 'GLOBAL',
    url text NOT NULL,
    logo_url text,
    price text,
    quality text,
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS aggregator_runs (
    id serial PRIMARY KEY,
    adapter text NOT NULL,
    status text NOT NULL DEFAULT 'running',
    imported integer NOT NULL DEFAULT 0,
    updated integer NOT NULL DEFAULT 0,
    skipped integer NOT NULL DEFAULT 0,
    errors jsonb NOT NULL DEFAULT '[]'::jsonb,
    started_at timestamp NOT NULL DEFAULT now(),
    finished_at timestamp
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    password_hash text NOT NULL,
    preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS watchlist (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title_id integer NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    added_at timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, title_id)
  )`,
  `CREATE TABLE IF NOT EXISTS watch_progress (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title_id integer NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    episode_id integer REFERENCES episodes(id) ON DELETE CASCADE,
    position_seconds real NOT NULL DEFAULT 0,
    duration_seconds real NOT NULL DEFAULT 0,
    completed boolean NOT NULL DEFAULT false,
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  // Indexes & unique constraints (mirror schema.ts)
  `CREATE UNIQUE INDEX IF NOT EXISTS titles_external_idx ON titles (external_source, external_id)`,
  `CREATE INDEX IF NOT EXISTS titles_kind_idx ON titles (kind)`,
  `CREATE INDEX IF NOT EXISTS titles_year_idx ON titles (year)`,
  `CREATE INDEX IF NOT EXISTS titles_popularity_idx ON titles (popularity)`,
  `CREATE INDEX IF NOT EXISTS credits_title_idx ON credits (title_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS seasons_title_number_idx ON seasons (title_id, number)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS episodes_season_number_idx ON episodes (season_id, number)`,
  `CREATE INDEX IF NOT EXISTS sources_title_idx ON sources (title_id)`,
  `CREATE INDEX IF NOT EXISTS sources_episode_idx ON sources (episode_id)`,
  `CREATE INDEX IF NOT EXISTS availability_title_idx ON availability (title_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS availability_unique_idx ON availability (title_id, platform_slug, kind, region)`,
  `CREATE INDEX IF NOT EXISTS progress_user_idx ON watch_progress (user_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS progress_user_title_episode_idx ON watch_progress (user_id, title_id, episode_id)`,
];

export async function bootstrapSchema(db: Executable): Promise<void> {
  for (const stmt of [...STATEMENTS, `CREATE TABLE IF NOT EXISTS playback_checks (
    title_id integer PRIMARY KEY REFERENCES titles(id) ON DELETE CASCADE,
    available boolean NOT NULL DEFAULT false,
    checked_at timestamptz NOT NULL DEFAULT now()
  )`, `CREATE TABLE IF NOT EXISTS episode_playback_checks (
    episode_id integer PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
    available boolean NOT NULL DEFAULT false,
    checked_at timestamptz NOT NULL DEFAULT now()
  )`]) {
    await db.execute(sql.raw(stmt));
  }
}
