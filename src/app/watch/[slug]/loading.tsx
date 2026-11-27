export default function FindingPlaybackSources() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8" role="status" aria-live="polite">
      <div className="grid aspect-video place-items-center rounded-2xl border border-white/10 bg-ink-800">
        <div className="max-w-md px-6 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-ember" aria-hidden="true" />
          <h1 className="font-display text-xl font-semibold">Finding playback sources</h1>
          <p className="mt-2 text-sm text-mist">Checking providers for this title. A live source lookup can take up to 45 seconds.</p>
        </div>
      </div>
    </section>
  );
}
