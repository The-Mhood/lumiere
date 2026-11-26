import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
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
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-snow antialiased">
        <Navbar user={user} />
        <main className="min-h-[70vh]">{children}</main>
        <footer className="mt-20 border-t border-white/5 py-10 text-center text-sm text-mist">
          <div className="mx-auto max-w-7xl px-4">
            <p className="font-display text-lg font-semibold text-snow">Lumière</p>
            <p className="mt-2">
              Every title on Lumière is openly licensed (CC BY — Blender Foundation open movies) and streamed from
              authorized providers only. No ads. No pop-ups. Ever.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
