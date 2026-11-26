"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fd)),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  const field = "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm placeholder:text-mist/50 focus:border-ember/60 focus:outline-none";

  return (
    <div className="mx-auto mt-10 w-full max-w-md px-4">
      <div className="rounded-3xl border border-white/5 bg-ink-800 p-8 shadow-2xl">
        <h1 className="font-display text-3xl font-bold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-mist">
          {mode === "login" ? "Sign in to sync your watchlist and resume playback." : "Free forever. No ads, no card required."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "register" && <input name="name" placeholder="Display name" required minLength={2} className={field} autoComplete="name" />}
          <input name="email" type="email" placeholder="Email address" required className={field} autoComplete="email" />
          <input
            name="password"
            type="password"
            placeholder={mode === "register" ? "Password (8+ characters)" : "Password"}
            required
            minLength={mode === "register" ? 8 : 1}
            className={field}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
          />
          {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-ember py-3 font-semibold text-ink transition hover:bg-ember-600 disabled:opacity-60">
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-mist">
          {mode === "login" ? (
            <>No account? <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-ember hover:underline">Join free</Link></>
          ) : (
            <>Already a member? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-ember hover:underline">Sign in</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
