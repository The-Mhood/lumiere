"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type shakaNs from "shaka-player";
import type { PlayableSource } from "@/lib/streaming";
import { Controls } from "./controls";
import { useRouter } from "next/navigation";

type Shaka = typeof shakaNs;
type Player = shakaNs.Player;

export interface PlayerTrackState {
  qualities: { height: number; label: string }[];
  activeQuality: number | "auto";
  audio: { language: string; label: string }[];
  activeAudio: string | null;
  text: { language: string; label: string }[];
  activeText: string | null;
}

export interface VideoPlayerProps {
  titleId: number;
  episodeId?: number;
  heading: string;
  subheading?: string;
  poster?: string | null;
  sources: PlayableSource[];
  initialSourceId?: number;
  resumeAt?: number;
  loggedIn: boolean;
  preferredSubtitle?: string;
  preferredAudio?: string;
  nextHref?: string;
  prevHref?: string;
  backHref: string;
}

const EMPTY: PlayerTrackState = { qualities: [], activeQuality: "auto", audio: [], activeAudio: null, text: [], activeText: null };

export function VideoPlayer(props: VideoPlayerProps) {
  const { sources, titleId, episodeId, loggedIn } = props;
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const shakaRef = useRef<Shaka | null>(null);
  const resumedRef = useRef(false);

  const [loadAttempt, setLoadAttempt] = useState(0);
  const positionRef = useRef(0);
  const [sourceId, setSourceId] = useState<number>(() => {
    const wanted = props.initialSourceId && sources.find((s) => s.id === props.initialSourceId);
    return wanted ? wanted.id : (sources[0]?.id ?? 0);
  });
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tracks, setTracks] = useState<PlayerTrackState>(EMPTY);
  const [notice, setNotice] = useState<string | null>(null);

  const source = useMemo(() => sources.find((s) => s.id === sourceId) ?? sources[0], [sources, sourceId]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 2200);
  }, []);

  /* ------------------------------------------------------------ */
  /* Track inventory                                                */
  /* ------------------------------------------------------------ */
  const refreshTracks = useCallback(() => {
    const p = playerRef.current;
    if (!p || !source || source.format === "mp4") return;
    const videoTracks = p.getVideoTracks();
    const heights = [...new Set(videoTracks.map((t) => t.height ?? 0).filter(Boolean))].sort((a, b) => b - a);
    const activeV = videoTracks.find((t) => t.active);
    const abr = p.getConfiguration().abr.enabled;
    const audioTracks = p.getAudioTracks();
    const audio = [...new Map(audioTracks.map((t) => [t.language, { language: t.language, label: t.label || langName(t.language) }])).values()];
    const activeA = audioTracks.find((t) => t.active)?.language ?? null;
    const textTracks = p.getTextTracks();
    const text = [...new Map(textTracks.map((t) => [t.language, { language: t.language, label: t.label || langName(t.language) }])).values()];
    const activeT = textTracks.find((t) => t.active)?.language ?? null;
    setTracks({
      qualities: heights.map((h) => ({ height: h, label: qualityLabel(h) })),
      activeQuality: abr ? "auto" : (activeV?.height ?? "auto"),
      audio,
      activeAudio: activeA,
      text,
      activeText: activeT,
    });
  }, [source]);

  /* ------------------------------------------------------------ */
  /* Load a source                                                  */
  /* ------------------------------------------------------------ */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    let cancelled = false;
    let failedOnce = false;
    let cleanupMedia: (() => void) | undefined;
    positionRef.current = video.currentTime || positionRef.current;
    setStatus("loading");
    setErrorMsg(null);
    setTracks(EMPTY);

    const onFail = (reason: string) => {
      if (cancelled || failedOnce) return;
      failedOnce = true;
      console.warn(`[player] source ${source.id} failed: ${reason}`);
      setFailed((prev) => {
        const next = new Set(prev).add(source.id);
        const fallback = sources.find((s) => !next.has(s.id));
        if (fallback) {
          flash(`${source.provider} unavailable — switching to ${fallback.provider}`);
          setTimeout(() => setSourceId(fallback.id), 50);
        } else {
          setStatus("error");
          setErrorMsg("All sources for this title are currently unavailable. Please try again later.");
        }
        return next;
      });
    };

    const run = async () => {
      // Tear down previous
      if (playerRef.current) {
        try {
          await playerRef.current.destroy();
          playerRef.current = null;
        } catch {}
      }
      // Remove external text tracks from previous mp4 source
      Array.from(video.querySelectorAll("track")).forEach((t) => t.remove());

      if (source.format === "mp4") {
        if (playerRef.current) {
          await playerRef.current.detach().catch(() => {});
        }
        video.src = source.url;
        for (const st of source.subtitles) {
          const track = document.createElement("track");
          track.kind = "subtitles";
          track.label = st.label;
          track.srclang = st.lang;
          track.src = st.url;
          video.appendChild(track);
        }
        const onLoaded = () => {
          if (cancelled) return;
          setStatus("ready");
          setTracks({
            ...EMPTY,
            qualities: source.resolutions.map((r) => ({ height: parseInt(r, 10), label: qualityLabel(parseInt(r, 10)) })),
            activeQuality: parseInt(source.resolutions[0] ?? "0", 10) || "auto",
            text: source.subtitles.map((s) => ({ language: s.lang, label: s.label })),
          });
        };
        const onErr = () => onFail("media element error");
        video.addEventListener("loadedmetadata", onLoaded, { once: true });
        video.addEventListener("error", onErr, { once: true });
        video.load();
        cleanupMedia = () => {
          video.removeEventListener("loadedmetadata", onLoaded);
          video.removeEventListener("error", onErr);
        };
        return;
      }

      // Adaptive (HLS / DASH) via Shaka
      const shaka = shakaRef.current ?? (await import("shaka-player")).default;
      shakaRef.current = shaka;
      if (cancelled) return;
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) {
        setStatus("error");
        setErrorMsg("Your browser does not support adaptive streaming.");
        return;
      }
      let player = playerRef.current;
      if (!player) {
        player = new shaka.Player();
        playerRef.current = player;
        player.configure({
          abr: { enabled: true },
          streaming: { bufferingGoal: 30, rebufferingGoal: 2, retryParameters: { maxAttempts: 4, baseDelay: 500, backoffFactor: 2, timeout: 20000 } },
          manifest: { retryParameters: { maxAttempts: 3, baseDelay: 400 } },
        });
        player.addEventListener("error", (e) => {
          const detail = (e as unknown as { detail?: { severity?: number; code?: number; message?: string } }).detail;
          if (detail?.severity === 2) onFail(`shaka ${detail.code}`);
        });
        player.addEventListener("adaptation", refreshTracks);
        player.addEventListener("variantchanged", refreshTracks);
        player.addEventListener("textchanged", refreshTracks);
        player.addEventListener("trackschanged", refreshTracks);
      }
      video.removeAttribute("src");
      await player.attach(video);
      if (cancelled) return;
      const preferredAudio = localStorage.getItem("lumiere-audio") ?? props.preferredAudio;
      const preferredSubtitle = localStorage.getItem("lumiere-subtitle") ?? props.preferredSubtitle;
      if (preferredAudio) player.configure({ preferredAudioLanguage: preferredAudio });
      if (preferredSubtitle) player.configure({ preferredTextLanguage: preferredSubtitle });
      try {
        await player.load(source.url);
        if (cancelled) return;
        for (const track of source.subtitles) {
          try { await player.addTextTrackAsync(track.url, track.lang, "subtitle", "text/vtt", undefined, track.label); }
          catch { flash(`Subtitle unavailable: ${track.label}`); }
        }
        setStatus("ready");
        refreshTracks();
      } catch (e) {
        const err = e as { code?: number; severity?: number };
        if (err.code === 7000) return; // LOAD_INTERRUPTED — a newer load started
        onFail(`load error ${err.code}`);
      }
    };
    const deadline = setTimeout(() => onFail("source loading timed out"), 30000);
    const ready = () => clearTimeout(deadline);
    video.addEventListener("loadeddata", ready, { once: true });
    void run().catch((e) => onFail(String(e)));
    return () => {
      cancelled = true;
      clearTimeout(deadline);
      video.removeEventListener("loadeddata", ready);
      cleanupMedia?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id, loadAttempt]);

  /* Destroy on unmount */
  useEffect(() => {
    return () => {
      playerRef.current?.destroy().catch(() => {});
      playerRef.current = null;
    };
  }, []);

  /* ------------------------------------------------------------ */
  /* Resume + progress tracking                                     */
  /* ------------------------------------------------------------ */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || status !== "ready") return;
    if (!resumedRef.current && props.resumeAt && props.resumeAt > 5) {
      video.currentTime = props.resumeAt;
      flash(`Resumed from ${fmt(props.resumeAt)}`);
    }
    if (resumedRef.current && positionRef.current > 0) video.currentTime = positionRef.current;
    resumedRef.current = true;
    video.play().catch(() => {});
  }, [status, props.resumeAt, flash]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !loggedIn) return;
    let last = 0;
    const send = () => {
      if (!video.duration || Number.isNaN(video.duration)) return;
      const body = JSON.stringify({ titleId, episodeId, position: video.currentTime, duration: video.duration });
      navigator.sendBeacon?.("/api/progress", new Blob([body], { type: "application/json" })) ||
        fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    };
    const onTime = () => {
      if (Date.now() - last > 5000) {
        last = Date.now();
        send();
      }
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("pause", send);
    window.addEventListener("beforeunload", send);
    return () => {
      send();
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("pause", send);
      window.removeEventListener("beforeunload", send);
    };
  }, [titleId, episodeId, loggedIn]);

  /* ------------------------------------------------------------ */
  /* Track selection handlers                                       */
  /* ------------------------------------------------------------ */
  const selectQuality = (q: number | "auto") => {
    const p = playerRef.current;
    if (!p || source?.format === "mp4") return;
    if (q === "auto") {
      p.configure({ abr: { enabled: true } });
    } else {
      p.configure({ abr: { enabled: false } });
      const track = p.getVideoTracks().filter((t) => t.height === q).sort((a, b) => b.bandwidth - a.bandwidth)[0];
      if (track) p.selectVideoTrack(track, true);
    }
    flash(q === "auto" ? "Quality: Auto" : `Quality: ${qualityLabel(q)}`);
    setTimeout(refreshTracks, 100);
  };

  const selectAudio = (lang: string) => {
    const p = playerRef.current;
    if (!p) return;
    const t = p.getAudioTracks().find((a) => a.language === lang);
    if (t) p.selectAudioTrack(t);
    flash(`Audio: ${langName(lang)}`);
    setTimeout(refreshTracks, 100);
  };

  const selectText = (lang: string | null) => {
    const video = videoRef.current;
    if (source?.format === "mp4" && video) {
      for (const tt of Array.from(video.textTracks)) tt.mode = tt.language === lang ? "showing" : "disabled";
      setTracks((t) => ({ ...t, activeText: lang }));
    } else {
      const p = playerRef.current;
      if (!p) return;
      if (!lang) {
        p.selectTextTrack(null);
      } else {
        const t = p.getTextTracks().find((x) => x.language === lang);
        if (t) p.selectTextTrack(t);
      }
      setTimeout(refreshTracks, 100);
    }
    flash(lang ? `Subtitles: ${langName(lang)}` : "Subtitles off");
    if (loggedIn) {
      fetch("/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { subtitleLang: lang ?? "" } }) }).catch(() => {});
    }
  };

  const switchSource = (id: number) => {
    if (id === sourceId) return;
    const s = sources.find((x) => x.id === id);
    if (s) flash(`Switching to ${s.label}`);
    setFailed((f) => {
      const n = new Set(f);
      n.delete(id);
      return n;
    });
    setSourceId(id);
  };

  if (!sources.length) {
    return (
      <div className="grid aspect-video w-full place-items-center rounded-2xl bg-ink-800 text-mist">
        No authorized streaming source is available for this title.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="group/player relative aspect-video w-full overflow-hidden bg-black select-none">
      <video
        ref={videoRef}
        className="h-full w-full"
        poster={props.poster ?? undefined}
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        onClick={() => {
          const v = videoRef.current;
          if (v) v.paused ? v.play() : v.pause();
        }}
        onEnded={() => {
          if (props.nextHref && localStorage.getItem("lumiere-autoplay") !== "false") router.push(props.nextHref);
        }}
        onDoubleClick={() => toggleFullscreen(containerRef.current)}
      />
      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-ember" aria-label="Loading" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center">
          <div>
            <p className="font-display text-xl font-semibold">Playback unavailable</p>
            <p className="mt-2 max-w-md text-sm text-mist">{errorMsg}</p>
            <button onClick={() => { setFailed(new Set()); setSourceId(sources[0].id); setLoadAttempt((n) => n + 1); setStatus("loading"); }} className="mt-4 rounded-full bg-ember px-5 py-2 font-semibold text-ink">
              Retry
            </button>
          </div>
        </div>
      )}
      {notice && (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-ink/80 px-4 py-1.5 text-sm backdrop-blur fade-up">{notice}</div>
      )}
      <Controls
        videoRef={videoRef}
        containerRef={containerRef}
        heading={props.heading}
        subheading={props.subheading}
        backHref={props.backHref}
        nextHref={props.nextHref}
        prevHref={props.prevHref}
        sources={sources}
        failed={failed}
        activeSourceId={source?.id ?? 0}
        onSource={switchSource}
        tracks={tracks}
        onQuality={selectQuality}
        onAudio={selectAudio}
        onText={selectText}
        isAdaptive={source?.format !== "mp4"}
        flash={flash}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */

export function toggleFullscreen(el: HTMLElement | null) {
  if (!el) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else el.requestFullscreen().catch(() => {});
}

export function qualityLabel(h: number) {
  if (h >= 2160) return "4K";
  if (h >= 1440) return "1440p";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  return `${h}p`;
}

const LANGS: Record<string, string> = {
  en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch", ru: "Russian", sv: "Swedish", pt: "Portuguese", ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic", hi: "Hindi", ur: "Urdu", tr: "Turkish", pl: "Polish", und: "Default",
};
export function langName(code: string) {
  const base = code.toLowerCase().split("-")[0];
  return LANGS[base] ?? code.toUpperCase();
}

export function fmt(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  return h ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}
