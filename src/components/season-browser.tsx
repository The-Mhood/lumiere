"use client";

import Link from "next/link";
import { useState } from "react";
import type { TitleDetail } from "@/lib/content";
import { Poster } from "./title-card";

type Seasons = TitleDetail["seasons"];

export function SeasonBrowser({ slug, seasons, currentEpisodeId }: { slug: string; seasons: Seasons; currentEpisodeId?: number }) {
  const initial = seasons.findIndex((s) => s.episodes.some((e) => e.id === currentEpisodeId));
  const [idx, setIdx] = useState(initial >= 0 ? initial : 0);
  const season = seasons[idx];
  if (!season) return null;

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">Episodes</h2>
        <div className="flex gap-2" role="tablist" aria-label="Seasons">
          {seasons.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === idx}
              onClick={() => setIdx(i)}
              className={`rounded-full px-4 py-1.5 text-sm transition ${i === idx ? "bg-ember font-semibold text-ink" : "bg-white/5 text-mist hover:bg-white/10"}`}
            >
              {s.name ?? `Season ${s.number}`}
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-ink-800">
        {season.episodes.map((e) => {
          const active = e.id === currentEpisodeId;
          return (
            <li key={e.id}>
              <Link
                href={`/watch/${slug}?ep=${e.id}`}
                className={`flex gap-4 p-3 transition hover:bg-white/5 sm:p-4 ${active ? "bg-ember/10" : ""}`}
                aria-current={active ? "true" : undefined}
              >
                <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-ink-700 sm:h-24 sm:w-40">
                  <Poster src={e.stillUrl} alt={e.name} className="h-full w-full object-top opacity-80" />
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-ink/70 text-snow backdrop-blur">
                      <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-ember">E{e.number}</span>
                    <h3 className="truncate font-semibold">{e.name}</h3>
                    {active && <span className="rounded bg-ember px-1.5 text-[10px] font-bold text-ink">NOW PLAYING</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-mist">{e.overview}</p>
                  <p className="mt-1 text-xs text-mist/70">
                    {e.runtimeMinutes ? `${e.runtimeMinutes} min` : ""}
                    {e.airDate ? ` · ${e.airDate}` : ""}
                    {e.sources.length ? ` · ${e.sources.length} server${e.sources.length > 1 ? "s" : ""}` : " · unavailable"}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
