import { NextRequest, NextResponse } from "next/server";

// Import Python backend modules (if using subprocess)
import aiohttp from "aiohttp";

export async function GET(request: NextRequest) {
  const searchParams = new URLSearchParams(request.nextUrl.searchParams);
  const query = searchParams.get("q") || "";
  
  // Call Python backend or scrape directly
  const session = new aiohttp.ClientSession();
  const scraper = new CinejoyScraper(session);
  
  try {
    const movieData = await scraper.fetch_movie(query);
    return NextResponse.json({
      success: true,
      data: movieData,
    });
  } finally {
    await session.close();
  }
}
