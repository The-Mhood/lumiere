"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function WatchlistButton({ titleId, initial, loggedIn }: { titleId: number; initial: boolean; loggedIn: boolean }) {
  const [inList, setInList] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  const toggle = () => {
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    start(async () => {
      const res = await fetch("/api/watchlist", {
        method: inList ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId }),
      });
      if (res.ok) {
        const d = await res.json();
        setInList(d.inWatchlist);
        router.refresh();
      }
    });
  };

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={inList}
      className={`inline-flex items-center gap-2 rounded-full border px-5 py-3 font-semibold transition disabled:opacity-60 ${
        inList ? "border-ember/60 bg-ember/10 text-ember" : "border-white/15 bg-white/5 hover:bg-white/10"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={inList ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
      </svg>
      {inList ? "In watchlist" : "Add to watchlist"}
    </button>
  );
}
