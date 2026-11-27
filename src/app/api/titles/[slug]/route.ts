import { withResolvedSources } from "@/lib/streaming/enrich";
import { getTitleBySlug } from "@/lib/content";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = await getTitleBySlug(slug);
  if (!title) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(await withResolvedSources(title), { headers: { "Cache-Control": "no-store" } });
}
