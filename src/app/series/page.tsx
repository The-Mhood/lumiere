import { Catalogue, parseQuery, type SearchParams } from "@/components/catalogue";

export const dynamic = "force-dynamic";
export const metadata = { title: "TV Series" };

export default async function SeriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  return <Catalogue base="/series" query={parseQuery(sp, "series")} heading="TV Series" intro="Season-by-season, episode-by-episode." />;
}
