import { getTitleBySlug } from "@/lib/content";
import { playbackIdentity } from "@/lib/streaming/identity";
import { getResolver } from "@/lib/streaming/providers";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const title = await getTitleBySlug((await params).slug);
  if (!title) return Response.json({ error: "Title not found" }, { status: 404 });
  const input = new URL(req.url).searchParams.get("episodeId");
  let episodeId = input ? Number(input) : undefined;
  if (title.kind === "series") {
    const episodes = title.seasons.flatMap((s) => s.episodes);
    episodeId ??= episodes[0]?.id;
    if (!episodes.some((e) => e.id === episodeId)) return Response.json({ error: "Episode not found" }, { status: 404 });
  } else if (episodeId !== undefined) return Response.json({ error: "Movie does not have episodes" }, { status: 400 });
  const result = await (await getResolver()).resolve(playbackIdentity(title, episodeId));
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
