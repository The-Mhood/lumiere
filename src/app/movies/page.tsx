import { Catalogue, parseQuery, type SearchParams } from "@/components/catalogue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Movies" };

export default async function MoviesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  return <Catalogue base="/movies" query={parseQuery(sp, "movie")} heading="Movies" intro="Browse by genre, year, country and quality." />;
}
