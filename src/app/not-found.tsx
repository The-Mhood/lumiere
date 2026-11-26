import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 text-center">
      <div>
        <p className="font-display text-7xl font-black text-white/10">404</p>
        <h1 className="font-display mt-2 text-2xl font-semibold">That reel is missing</h1>
        <p className="mt-2 text-mist">The title you were looking for doesn’t exist or was removed.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-ember px-6 py-3 font-semibold text-ink">Back to home</Link>
      </div>
    </div>
  );
}
