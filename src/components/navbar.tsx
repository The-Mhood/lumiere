"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavUser = { id: number; name: string; email: string } | null;

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/movies", label: "Movies" },
  { href: "/series", label: "Series" },
  { href: "/movies?sort=rating", label: "Top Rated" },
  { href: "/movies?platform=internet-archive", label: "Classics" },
  { href: "/aggregators", label: "Platforms" },
  { href: "/settings", label: "Settings" },
];

export function Navbar({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [suggest, setSuggest] = useState<{ slug: string; name: string; year: number; kind: string; posterUrl: string | null }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    // Close transient UI after route navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
    setSuggest([]);
  }, [pathname]);

  useEffect(() => {
    if (q.trim().length < 2) {
      // Reset the external search result when the query becomes empty.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggest([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setSuggest(d.data?.items ?? []))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isWatch = pathname.startsWith("/watch");

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled || open || isWatch ? "bg-ink/90 backdrop-blur-md border-b border-white/5" : "bg-gradient-to-b from-ink/90 to-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="font-display flex items-center gap-2 text-xl font-bold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ember text-ink shadow-[0_0_24px_rgba(255,92,56,0.5)]">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          Lumière
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors hover:text-snow ${
                pathname === l.href.split("?")[0] && !l.href.includes("?") ? "text-snow" : "text-mist"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <form
          role="search"
          className="relative ml-auto hidden w-full max-w-xs sm:block"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            setSuggest([]);
          }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search films, series…  ( / )"
            aria-label="Search"
            className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 pl-9 text-sm placeholder:text-mist/60 focus:border-ember/60 focus:bg-ink-700 focus:outline-none"
          />
          <svg className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-mist" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          {suggest.length > 0 && (
            <ul className="absolute left-0 right-0 top-11 overflow-hidden rounded-xl border border-white/10 bg-ink-800 shadow-2xl">
              {suggest.map((s) => (
                <li key={s.slug}>
                  <Link href={`/title/${s.slug}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-white/5">
                    {s.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.posterUrl} alt="" className="h-10 w-7 rounded object-cover" loading="lazy" />
                    ) : (
                      <span className="h-10 w-7 rounded bg-ink-600" />
                    )}
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="text-xs text-mist">
                      {s.year} · {s.kind === "series" ? "Series" : "Film"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <Link href="/library" className="rounded-full px-3 py-1.5 text-sm text-mist hover:text-snow">
                My Library
              </Link>
              <form action="/api/auth/logout" method="post">
                <button className="rounded-full border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5" title={user.email}>
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-full px-3 py-1.5 text-sm text-mist hover:text-snow">
                Sign in
              </Link>
              <Link href="/register" className="rounded-full bg-ember px-4 py-1.5 text-sm font-semibold text-ink hover:bg-ember-600">
                Join free
              </Link>
            </>
          )}
        </div>

        <button
          className="ml-auto rounded-lg p-2 hover:bg-white/5 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Toggle menu"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-white/5 bg-ink-800 px-4 py-4 md:hidden">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              aria-label="Search"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm"
            />
          </form>
          <nav className="mt-3 flex flex-col" aria-label="Mobile">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-mist hover:bg-white/5 hover:text-snow">
                {l.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link href="/library" className="rounded-lg px-3 py-2 text-mist hover:bg-white/5">
                  My Library
                </Link>
                <form action="/api/auth/logout" method="post">
                  <button className="w-full rounded-lg px-3 py-2 text-left text-mist hover:bg-white/5">Sign out</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="rounded-lg px-3 py-2 text-mist hover:bg-white/5">
                  Sign in
                </Link>
                <Link href="/register" className="mt-2 rounded-lg bg-ember px-3 py-2 text-center font-semibold text-ink">
                  Join free
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
