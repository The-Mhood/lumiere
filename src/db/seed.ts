import "dotenv/config";
import { db, closeDb } from "./index";
import { sql } from "drizzle-orm";
import { seedDatabase } from "./catalogue-seed";
// Resetting a catalogue cascades to watch history and watchlists. Opt in.
try {
  if (!process.argv.includes("--reset")) throw new Error("First boot seeds automatically. To destructively reset the catalogue, pass --reset.");
  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate table sources, credits, people, episodes, seasons, title_genres, titles, genres, providers restart identity cascade`);
    await seedDatabase(tx as unknown as typeof db);
  });
} finally { await closeDb(); }
