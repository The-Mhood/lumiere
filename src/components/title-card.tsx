import Link from "next/link";
import type { TitleCard as TitleCardData } from "@/lib/content";

export function Poster({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  if (!src) {
    return (
      <div className={`grid place-items-center bg-gradient-to-br from-ink-600 to-ink-800 p-4 text-center ${className}`}>
        <span className="font-display text-sm font-semibold text-mist">{alt}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={`object-cover ${className}`}
    />
  );
}

export function QualityBadge({ q }: { q: string }) {
  const label = q === "2160p" ? "4K" : q === "1440p" ? "QHD" : q === "1080p" ? "FHD" : q === "720p" ? "HD" : q.toUpperCase();
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide ${
        label === "4K" ? "bg-gold text-ink" : "bg-white/15 text-snow backdrop-blur"
      }`}
    >
      {label}
    </span>
  );
}

export function TitleCard({ item, progress }: { item: TitleCardData; progress?: number }) {
  return (
    <Link
      href={`/title/${item.slug}`}
      className="group relative block w-36 shrink-0 sm:w-44 lg:w-48"
      aria-label={`${item.name} (${item.year})`}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-700 ring-1 ring-white/5 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)] group-hover:ring-ember/50">
        <Poster src={item.posterUrl} alt={item.name} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="absolute left-2 top-2 flex gap-1">
          <QualityBadge q={item.maxQuality} />
          {item.kind === "series" && <span className="rounded bg-ember px-1.5 py-0.5 text-[10px] font-bold leading-none text-ink">SERIES</span>}
        </div>
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-ink/70 px-1.5 py-0.5 text-[11px] font-semibold text-gold backdrop-blur">
          ★ {item.rating.toFixed(1)}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center pb-4 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ember text-ink shadow-lg">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
        {progress !== undefined && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div className="h-full bg-ember" style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="truncate text-sm font-medium text-snow group-hover:text-ember">{item.name}</p>
        <p className="text-xs text-mist">
          {item.year}
          {item.runtimeMinutes ? ` · ${item.runtimeMinutes} min` : ""}
        </p>
      </div>
    </Link>
  );
}

export function Rail({
  title,
  href,
  children,
  subtitle,
}: {
  title: string;
  href?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto mt-10 max-w-7xl px-4 sm:px-6">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold sm:text-2xl">{title}</h2>
          {subtitle && <p className="text-sm text-mist">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="text-sm text-mist transition-colors hover:text-ember">
            View all →
          </Link>
        )}
      </div>
      <div className="rail -mx-4 px-4 sm:-mx-6 sm:px-6">{children}</div>
    </section>
  );
}

export function PosterGrid({ items }: { items: TitleCardData[] }) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-16 text-center text-mist">
        Nothing matched. Try widening your filters.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((it) => (
        <div key={it.id} className="[&>a]:w-full">
          <TitleCard item={it} />
        </div>
      ))}
    </div>
  );
}
