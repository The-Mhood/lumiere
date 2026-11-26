import { Catalogue, parseQuery, type SearchParams } from "@/components/catalogue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = parseQuery(sp);
  return <Catalogue base="/search" query={q} heading={q.q ? `Results for “${q.q}”` : "Search"} intro={q.q ? undefined : "Type in the search bar above to find films and series."} />;
}
