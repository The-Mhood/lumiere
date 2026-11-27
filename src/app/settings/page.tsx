"use client";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [autoplay, setAutoplay] = useState(true);
  const [audio, setAudio] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => {
    // Hydrate device-only storage after SSR; this is an external-store sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoplay(localStorage.getItem("lumiere-autoplay") !== "false");
    setAudio(localStorage.getItem("lumiere-audio") || "");
    setSubtitle(localStorage.getItem("lumiere-subtitle") || "");
  }, []);
  async function save() {
    localStorage.setItem("lumiere-autoplay", String(autoplay));
    localStorage.setItem("lumiere-audio", audio);
    localStorage.setItem("lumiere-subtitle", subtitle);
    try {
      const response = await fetch("/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { autoplay, audioLang: audio, subtitleLang: subtitle } }) });
      setSaved(response.ok ? "Saved on this device and to your account." : "Saved on this device.");
    } catch { setSaved("Saved on this device. Account sync is unavailable."); }
  }
  const langs = [["", "Default / off"], ["en", "English"], ["fr", "French"], ["es", "Spanish"], ["de", "German"], ["pt", "Portuguese"], ["ja", "Japanese"]];
  return <main className="mx-auto max-w-2xl px-6 py-28">
    <p className="text-sm uppercase tracking-widest text-ember">Your experience</p>
    <h1 className="mb-10 mt-3 font-display text-4xl font-bold">Settings</h1>
    <div className="space-y-7 rounded-2xl border border-white/10 bg-ink-800 p-7">
      <label className="flex items-center justify-between gap-6">Play the next episode automatically<input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} /></label>
      <label className="flex items-center justify-between gap-6">Preferred audio<select className="rounded-lg bg-ink-600 p-2" value={audio} onChange={(e) => setAudio(e.target.value)}>{langs.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="flex items-center justify-between gap-6">Preferred subtitles<select className="rounded-lg bg-ink-600 p-2" value={subtitle} onChange={(e) => setSubtitle(e.target.value)}>{langs.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <p className="text-sm text-mist">Track availability depends on the selected source. Device preferences persist after restarting Lumière.</p>
      <button onClick={save} className="rounded-full bg-ember px-6 py-2 font-semibold text-ink">Save preferences</button>
      <p role="status" className="text-sm text-mist">{saved}</p>
    </div>
  </main>;
}
