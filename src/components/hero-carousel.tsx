"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Title } from "@/db/schema";
import { QualityBadge } from "./title-card";

export function HeroCarousel({ items }: { items: Title[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [paused, items.length]);

  if (!items.length) return <div className="h-16" />;
  const item = items[i];

  return (
    <section
      className="relative h-[82vh] min-h-[520px] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {items.map((it, idx) => (
        <div
          key={it.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${idx === i ? "opacity-100" : "opacity-0"}`}
          aria-hidden={idx !== i}
        >
          {it.backdropUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={it.backdropUrl}
              alt=""
              className="h-full w-full scale-110 object-cover object-[center_30%] blur-[2px]"
              loading={idx === 0 ? "eager" : "lazy"}
              fetchPriority={idx === 0 ? "high" : "auto"}
            />
          )}
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-ink/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/60" />

      <div className="relative mx-auto flex h-full max-w-7xl items-end px-4 pb-20 sm:px-6 md:items-center md:pb-0">
        <div className="flex w-full items-center gap-8">
          <div key={item.id} className="fade-up max-w-xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ember">
              <span>Featured</span>
              <span className="text-mist">·</span>
              <span className="text-mist">{item.kind === "series" ? "Series" : "Film"}</span>
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.05] sm:text-6xl">{item.name}</h1>
            {item.tagline && <p className="mt-3 text-lg italic text-mist">{item.tagline}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-mist">
              <span className="font-semibold text-gold">★ {item.rating.toFixed(1)}</span>
              <span>{item.year}</span>
              {item.runtimeMinutes && <span>{item.runtimeMinutes} min</span>}
              <span>{item.country}</span>
              <QualityBadge q={item.maxQuality} />
            </div>
            <p className="line-clamp-3 mt-4 text-base text-snow/80">{item.synopsis}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/watch/${item.slug}`}
                className="inline-flex items-center gap-2 rounded-full bg-ember px-6 py-3 font-semibold text-ink transition hover:bg-ember-600 hover:shadow-[0_0_30px_rgba(255,92,56,0.45)]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                Watch now
              </Link>
              <Link
                href={`/title/${item.slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 font-semibold backdrop-blur transition hover:bg-white/10"
              >
                More info
              </Link>
            </div>
          </div>
          {item.posterUrl && (
            <div className="ml-auto hidden lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={item.id}
                src={item.posterUrl}
                alt={item.name}
                className="fade-up h-[420px] w-[280px] rounded-2xl object-cover shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10"
              />
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
        {items.map((it, idx) => (
          <button
            key={it.id}
            onClick={() => setI(idx)}
            aria-label={`Show ${it.name}`}
            className={`h-1.5 rounded-full transition-all ${idx === i ? "w-8 bg-ember" : "w-3 bg-white/30 hover:bg-white/60"}`}
          />
        ))}
      </div>
    </section>
  );
}
