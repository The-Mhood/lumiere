import { NextRequest, NextResponse } from "next/server";
import { desc, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { titles } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ success: true, data: [] });
  }

  try {
    const matches = await db
      .select()
      .from(titles)
      .where(or(ilike(titles.name, `%${query}%`), ilike(titles.originalName, `%${query}%`)))
      .orderBy(desc(titles.popularity), desc(titles.year))
      .limit(30);

    return NextResponse.json({ success: true, data: matches });
  } catch (error) {
    console.error("Catalogue search failed:", error);
    return NextResponse.json(
      { success: false, error: "Catalogue search is temporarily unavailable." },
      { status: 500 },
    );
  }
}
