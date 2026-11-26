"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlayableSource } from "@/lib/streaming";
import { fmt, langName, toggleFullscreen, type PlayerTrackState } from "./video-player";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  heading: string;
  subheading?: string;
  backHref: string;
  nextHref?: string;
  prevHref?: string;
  sources: PlayableSource[];
  failed: Set<number>;
  activeSourceId: number;
  onSource: (id: number) => void;
  tracks: PlayerTrackState;
  onQuality: (q: number | "auto") => void;
  onAudio: (lang: string) => void;
  onText: (lang: string | null) => void;
  isAdaptive: boolean;
  flash: (msg: string) => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function Controls(p: Props) {
  const { videoRef, containerRef } = p;
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [visible, setVisible] = useState(true);
  const [menu, setMenu] = useState<null | "settings" | "sources" | "subs" | "audio">(null);
  const [fs, setFs] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Media element events */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setTime(v.currentTime);
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onDur = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVol = () => {
      setVolume(v.volume);
      setMuted(v.muted);
    };
    const onRate = () => setSpeed(v.playbackRate);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("progress", onTime);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("volumechange", onVol);
    v.addEventListener("ratechange", onRate);
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("progress", onTime);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("volumechange", onVol);
      v.removeEventListener("ratechange", onRate);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [videoRef]);

  /* Auto-hide */
  const poke = () => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!menu && videoRef.current && !videoRef.current.paused) setVisible(false);
    }, 2800);
  };
  useEffect(() => {
    // Resynchronize the controls visibility timer with media events.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    poke();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, menu]);

  /* Keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const seek = (d: number) => {
        v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + d));
        p.flash(`${d > 0 ? "+" : ""}${d}s`);
      };
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          break;
        case "arrowright":
          seek(5);
          break;
        case "arrowleft":
          seek(-5);
          break;
        case "l":
          seek(10);
          break;
        case "j":
          seek(-10);
          break;
        case "arrowup":
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          p.flash(`Volume ${Math.round(v.volume * 100)}%`);
          break;
        case "arrowdown":
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          p.flash(`Volume ${Math.round(v.volume * 100)}%`);
          break;
        case "m":
          v.muted = !v.muted;
          p.flash(v.muted ? "Muted" : "Unmuted");
          break;
        case "f":
          toggleFullscreen(containerRef.current);
          break;
        case "p":
          togglePip(v);
          break;
        case "c":
          p.onText(p.tracks.activeText ? null : (p.tracks.text[0]?.language ?? null));
          break;
        case ">":
        case ".":
          if (e.shiftKey || e.key === ">") {
            const i = SPEEDS.indexOf(v.playbackRate);
            v.playbackRate = SPEEDS[Math.min(SPEEDS.length - 1, i + 1)];
            p.flash(`Speed ${v.playbackRate}×`);
          }
          break;
        case "<":
        case ",":
          if (e.shiftKey || e.key === "<") {
            const i = SPEEDS.indexOf(v.playbackRate);
            v.playbackRate = SPEEDS[Math.max(0, i - 1)];
            p.flash(`Speed ${v.playbackRate}×`);
          }
          break;
        case "n":
          if (p.nextHref && e.shiftKey) window.location.href = p.nextHref;
          break;
        default:
          if (/^[0-9]$/.test(e.key) && v.duration) {
            v.currentTime = (Number(e.key) / 10) * v.duration;
          } else return;
      }
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.tracks, p.nextHref]);

  const v = videoRef.current;
  const pct = duration ? (time / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;
  const active = p.sources.find((s) => s.id === p.activeSourceId);
  const activeQualityLabel =
    p.tracks.activeQuality === "auto"
      ? `Auto${p.tracks.qualities[0] ? ` · up to ${p.tracks.qualities[0].label}` : ""}`
      : p.tracks.qualities.find((q) => q.height === p.tracks.activeQuality)?.label ?? "Auto";



  return (
    <div
      className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0 cursor-none"}`}
      onMouseMove={poke}
      onTouchStart={poke}
      onClick={(e) => {
        if (menu && e.target === e.currentTarget) setMenu(null);
      }}
    >
      {/* Top bar */}
      <div className="pointer-events-none flex items-start gap-3 bg-gradient-to-b from-black/80 to-transparent p-4">
        <Link href={p.backHref} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10" aria-label="Back">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div className="min-w-0">
          <p className="font-display truncate text-lg font-semibold">{p.heading}</p>
          {p.subheading && <p className="truncate text-sm text-mist">{p.subheading}</p>}
        </div>
        {active && (
          <span className="ml-auto hidden rounded-full bg-black/40 px-3 py-1 text-xs text-mist backdrop-blur sm:block">
            {active.provider} · {active.format.toUpperCase()}
          </span>
        )}
      </div>

      {/* Center play */}
      {!playing && (
        <button
          onClick={() => v?.play()}
          aria-label="Play"
          className="pointer-events-auto absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ember/90 text-ink shadow-2xl transition hover:scale-105"
        >
          <svg viewBox="0 0 24 24" className="ml-1 h-9 w-9" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>
      )}

      {/* Bottom */}
      <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-3 pt-10">
        {/* Seek */}
        <div className="relative mb-2 h-4 w-full">
          <div className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
          </div>
          <input
            type="range"
            className="seek absolute inset-x-0 top-1.5 w-full"
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            style={{ ["--value" as string]: `${pct}%`, background: `linear-gradient(to right, #ff5c38 ${pct}%, transparent ${pct}%)` }}
            onChange={(e) => {
              if (v) v.currentTime = Number(e.target.value);
            }}
            aria-label="Seek"
          />
        </div>

        <div className="flex items-center gap-1">
          <Btn onClick={() => (v?.paused ? v.play() : v?.pause())} label={playing ? "Pause (k)" : "Play (k)"}>
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </Btn>
          {p.prevHref && (
            <Link href={p.prevHref} className="hidden h-10 w-10 place-items-center rounded-lg hover:bg-white/10 sm:grid" aria-label="Previous episode" title="Previous episode">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
            </Link>
          )}
          {p.nextHref && (
            <Link href={p.nextHref} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10" aria-label="Next episode" title="Next episode (shift+N)">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" /></svg>
            </Link>
          )}
          <Btn onClick={() => { if (v) { v.currentTime -= 10; } }} label="Back 10s (j)">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
          </Btn>
          <Btn onClick={() => { if (v) { v.currentTime += 10; } }} label="Forward 10s (l)">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
          </Btn>

          <div className="group/vol flex items-center">
            <Btn onClick={() => { if (v) v.muted = !v.muted; }} label={muted ? "Unmute (m)" : "Mute (m)"}>
              {muted || volume === 0 ? (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>
              )}
            </Btn>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => { if (v) { v.volume = Number(e.target.value); v.muted = false; } }}
              className="seek w-0 opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:opacity-100 sm:w-20 sm:opacity-100"
              style={{ background: `linear-gradient(to right, #fff ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,.25) ${(muted ? 0 : volume) * 100}%)` }}
              aria-label="Volume"
            />
          </div>

          <span className="ml-2 text-xs tabular-nums text-snow/90 sm:text-sm">
            {fmt(time)} <span className="text-mist">/ {fmt(duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-1">
            {/* Sources */}
            <button
              onClick={() => setMenu(menu === "sources" ? null : "sources")}
              className={`hidden h-10 items-center gap-2 rounded-lg px-3 text-sm hover:bg-white/10 sm:flex ${menu === "sources" ? "bg-white/10" : ""}`}
              aria-haspopup="menu"
              aria-expanded={menu === "sources"}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="6" rx="1" /><rect x="3" y="14" width="18" height="6" rx="1" /><path d="M7 7h.01M7 17h.01" /></svg>
              Servers
            </button>
            {/* Subtitles */}
            {p.tracks.text.length > 0 && (
              <Btn onClick={() => setMenu(menu === "subs" ? null : "subs")} label="Subtitles (c)" activeState={!!p.tracks.activeText}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15h4M13 15h4M7 11h2M11 11h6" /></svg>
              </Btn>
            )}
            {/* Audio */}
            {p.tracks.audio.length > 1 && (
              <Btn onClick={() => setMenu(menu === "audio" ? null : "audio")} label="Audio track">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              </Btn>
            )}
            {/* Settings */}
            <Btn onClick={() => setMenu(menu === "settings" ? null : "settings")} label="Settings" activeState={menu === "settings"}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
            </Btn>
            {/* PiP */}
            {typeof document !== "undefined" && "pictureInPictureEnabled" in document && (
              <Btn onClick={() => v && togglePip(v)} label="Picture in picture (p)">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><rect x="12" y="11" width="8" height="6" rx="1" fill="currentColor" /></svg>
              </Btn>
            )}
            <Btn onClick={() => toggleFullscreen(containerRef.current)} label={fs ? "Exit fullscreen (f)" : "Fullscreen (f)"}>
              {fs ? (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5" /></svg>
              )}
            </Btn>
          </div>
        </div>
      </div>

      {/* Menus */}
      {menu && (
        <div className="absolute bottom-20 right-4 w-72 max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-white/10 bg-ink-800/95 text-sm shadow-2xl backdrop-blur" role="menu">
          {menu === "settings" && (
            <div className="max-h-80 overflow-y-auto">
              <MenuSection title="Quality">
                {p.isAdaptive && <MenuItem active={p.tracks.activeQuality === "auto"} onClick={() => p.onQuality("auto")}>Auto {p.tracks.activeQuality === "auto" && <span className="text-mist">({activeQualityLabel.replace("Auto · ", "")})</span>}</MenuItem>}
                {p.tracks.qualities.map((q) => (
                  <MenuItem key={q.height} active={p.tracks.activeQuality === q.height} onClick={() => p.isAdaptive && p.onQuality(q.height)}>
                    {q.label} {q.height >= 2160 && <span className="rounded bg-gold px-1 text-[10px] font-bold text-ink">UHD</span>}
                    {q.height >= 1080 && q.height < 2160 && <span className="rounded bg-white/15 px-1 text-[10px] font-bold">HD</span>}
                  </MenuItem>
                ))}
                {!p.tracks.qualities.length && <p className="px-4 py-2 text-mist">Detecting…</p>}
              </MenuSection>
              <MenuSection title="Speed">
                <div className="flex flex-wrap gap-1 px-3 pb-2">
                  {SPEEDS.map((s) => (
                    <button key={s} onClick={() => { if (v) v.playbackRate = s; }} className={`rounded-md px-2.5 py-1 ${speed === s ? "bg-ember text-ink font-semibold" : "bg-white/5 hover:bg-white/10"}`}>
                      {s}×
                    </button>
                  ))}
                </div>
              </MenuSection>
              <MenuSection title="Servers">
                <SourceList {...p} />
              </MenuSection>
              <MenuSection title="Keyboard">
                <p className="px-4 pb-3 text-xs leading-relaxed text-mist">
                  Space/K play · ←/→ 5s · J/L 10s · ↑/↓ volume · M mute · F fullscreen · P PiP · C captions · &lt;/&gt; speed · 0–9 jump
                </p>
              </MenuSection>
            </div>
          )}
          {menu === "sources" && (
            <MenuSection title="Streaming servers">
              <SourceList {...p} />
            </MenuSection>
          )}
          {menu === "subs" && (
            <MenuSection title="Subtitles">
              <MenuItem active={!p.tracks.activeText} onClick={() => p.onText(null)}>Off</MenuItem>
              {p.tracks.text.map((t) => (
                <MenuItem key={t.language} active={p.tracks.activeText === t.language} onClick={() => p.onText(t.language)}>
                  {t.label || langName(t.language)}
                </MenuItem>
              ))}
            </MenuSection>
          )}
          {menu === "audio" && (
            <MenuSection title="Audio">
              {p.tracks.audio.map((t) => (
                <MenuItem key={t.language} active={p.tracks.activeAudio === t.language} onClick={() => p.onAudio(t.language)}>
                  {t.label || langName(t.language)}
                </MenuItem>
              ))}
            </MenuSection>
          )}
        </div>
      )}
    </div>
  );
}

function SourceList(p: Pick<Props, "sources" | "failed" | "activeSourceId" | "onSource">) {
  return (
    <>
      {p.sources.map((s) => {
        const dead = p.failed.has(s.id);
        return (
          <MenuItem key={s.id} active={s.id === p.activeSourceId} onClick={() => p.onSource(s.id)}>
            <span className="flex-1">
              <span className="block">{s.label}</span>
              <span className="block text-xs text-mist">
                {s.provider} · {s.format.toUpperCase()} · {s.resolutions[s.resolutions.length - 1]}
                {s.subtitleLanguages.length ? " · CC" : ""}
                {s.audioLanguages.length > 1 ? ` · ${s.audioLanguages.length} audio` : ""}
              </span>
            </span>
            <span className={`h-2 w-2 rounded-full ${dead ? "bg-red-500" : s.status === "degraded" ? "bg-gold" : "bg-emerald-400"}`} aria-label={dead ? "failed" : s.status} />
          </MenuItem>
        );
      })}
    </>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/5 last:border-0">
      <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-mist">{title}</p>
      {children}
    </div>
  );
}

function MenuItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="menuitemradio" aria-checked={active} onClick={onClick} className={`flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-white/5 ${active ? "text-ember" : ""}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-ember" : "bg-transparent"}`} />
      {children}
    </button>
  );
}

async function togglePip(v: HTMLVideoElement) {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await v.requestPictureInPicture();
  } catch {}
}

const Btn = ({ onClick, label, children, activeState }: { onClick: () => void; label: string; children: React.ReactNode; activeState?: boolean }) => (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 place-items-center rounded-lg transition hover:bg-white/10 ${activeState ? "text-ember" : "text-snow"}`}
    >
      {children}
    </button>
  );
