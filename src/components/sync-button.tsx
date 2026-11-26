"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton({ adapter, disabled }: { adapter: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <button
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch(`/api/aggregate/sync?adapter=${adapter}&limit=30`, { method: "POST" });
            const d = await res.json();
            setMsg(res.ok ? `Imported ${d.imported}, updated ${d.updated}, skipped ${d.skipped}` : d.errors?.at(-1) ?? d.error ?? "Failed");
            router.refresh();
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-ink transition hover:bg-ember-600 disabled:opacity-50"
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
      {msg && <span className="text-xs text-mist">{msg}</span>}
    </div>
  );
}
