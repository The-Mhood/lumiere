import Link from "next/link";
import { aggregatorStatus } from "@/lib/aggregators";
import { SyncButton } from "@/components/sync-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aggregators" };

export default async function AggregatorsPage() {
  const s = await aggregatorStatus();
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Content aggregators</h1>
      <p className="mt-2 max-w-2xl text-mist">
        Lumière pulls catalogues and cross-platform availability from legitimate platforms through pluggable adapters.
        Every imported stream is validated against the provider&apos;s host allow-list before it can be played.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {s.adapters.map((a) => (
          <div key={a.key} className="rounded-2xl border border-white/5 bg-ink-800 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">{a.name}</h2>
                <p className="mt-1 text-sm text-mist">{a.description}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.configured ? "bg-emerald-500/15 text-emerald-300" : "bg-gold/15 text-gold"}`}>
                {a.configured ? "Ready" : "Needs API key"}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div><dt className="text-mist">Titles</dt><dd className="font-display text-2xl font-bold">{a.titles}</dd></div>
              <div><dt className="text-mist">Last run</dt><dd>{a.lastRun ? new Date(a.lastRun.startedAt).toLocaleString() : "never"}</dd></div>
              <div><dt className="text-mist">Status</dt><dd className={a.lastRun?.status === "failed" ? "text-red-300" : ""}>{a.lastRun ? `${a.lastRun.status} · +${a.lastRun.imported} / ~${a.lastRun.updated} / −${a.lastRun.skipped}` : "—"}</dd></div>
            </dl>
            {!a.configured && a.key === "tmdb" && (
              <p className="mt-3 rounded-lg bg-white/5 p-3 text-xs text-mist">Set <code>TMDB_API_KEY</code> (and optionally <code>TMDB_REGIONS=PK,US</code>) to enable Netflix / Prime / Apple TV / Disney+ availability links.</p>
            )}
            <div className="mt-4"><SyncButton adapter={a.key} disabled={!a.configured} /></div>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold">Platforms indexed</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {s.platforms.length ? s.platforms.map((p) => (
            <span key={p.platform} className="rounded-full border border-white/10 px-3 py-1 text-sm">{p.platform} <span className="text-mist">· {p.count}</span></span>
          )) : <p className="text-mist">No availability data yet — run a sync.</p>}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold">Recent runs</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/5">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-mist"><tr><th className="p-3">Adapter</th><th className="p-3">Started</th><th className="p-3">Status</th><th className="p-3">Imported</th><th className="p-3">Updated</th><th className="p-3">Skipped</th><th className="p-3">Errors</th></tr></thead>
            <tbody>
              {s.recentRuns.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-3">{r.adapter}</td><td className="p-3 text-mist">{new Date(r.startedAt).toLocaleString()}</td>
                  <td className={`p-3 ${r.status === "failed" ? "text-red-300" : r.status === "success" ? "text-emerald-300" : ""}`}>{r.status}</td>
                  <td className="p-3">{r.imported}</td><td className="p-3">{r.updated}</td><td className="p-3">{r.skipped}</td>
                  <td className="p-3 text-xs text-mist" title={r.errors.join("\n")}>{r.errors.length}</td>
                </tr>
              ))}
              {!s.recentRuns.length && <tr><td className="p-3 text-mist" colSpan={7}>No runs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="mt-8 text-sm text-mist">Imported catalogue titles appear in <Link href="/movies?platform=owned-sites" className="text-ember">Movies → Owned sites</Link> and on the homepage.</p>
    </div>
  );
}
