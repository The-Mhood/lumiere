import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { HostedPreviewFrame } from "@/components/hosted-preview-frame";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { getCurrentUser } from "@/lib/auth";

// Fonts: system stack (see globals.css `--font-sans` / `--font-display`).
// The previous `next/font/google` setup fetched Inter/Outfit from
// fonts.googleapis.com at build time, which broke offline builds and the
// desktop shell. The CSS variables keep the same look with zero network
// dependency; self-hosted fonts can be dropped into `public/fonts` later.

export const metadata: Metadata = {
  title: { default: "Lumière — Stream films in up to 4K", template: "%s · Lumière" },
  description:
    "An ad-free, premium streaming platform for openly licensed films and series. Multiple sources, adaptive 4K playback, subtitles and watchlists.",
};

export const viewport: Viewport = { themeColor: "#07080c" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  if (process.env.LUMIERE_REMOTE_APP_URL) {
    const endpoint = new URL(process.env.LUMIERE_REMOTE_APP_URL);
    if (endpoint.protocol !== 'https:') throw new Error('Hosted preview requires HTTPS');
    return <html lang="en"><body className="bg-ink text-snow"><Suspense fallback={<p className="p-6">Connecting to the hosted app…</p>}><HostedPreviewFrame endpoint={endpoint.origin} /></Suspense></body></html>;
  }
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-snow antialiased">
        {process.env.LUMIERE_PREVIEW_EXPIRES_AT && <p className="bg-gold/10 px-4 py-2 text-center text-xs text-gold">Temporary development preview · expires {new Date(process.env.LUMIERE_PREVIEW_EXPIRES_AT).toUTCString()} · preview accounts/history are temporary.</p>}
        <Navbar user={user} />
        <main className="min-h-[70vh]">{children}</main>
        <footer className="mt-20 border-t border-white/5 py-10 text-center text-sm text-mist">
          <div className="mx-auto max-w-7xl px-4">
            <p className="font-display text-lg font-semibold text-snow">Lumière</p>
            <p className="mt-2">
              Movie discovery across providers. Playback availability and licensing vary by title and source.
              Catalogue listings are not a guarantee of in-app streaming.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
