import "dotenv/config";
import { closeDb } from "./index";
import { ADAPTERS, runAggregation } from "@/lib/aggregators";

const key = process.argv[2] ?? "internet-archive";
const limit = Number(process.argv[3] ?? 40);
runAggregation(key, limit)
  .then(async (r) => {
    console.log(JSON.stringify({ ...r, errors: r.errors.slice(0, 5) }, null, 2));
    console.log("adapters:", ADAPTERS.map((a) => `${a.key}${a.configured() ? "" : " (not configured)"}`).join(", "));
    await closeDb();
  })
  .catch(async (e) => {
    console.error(e);
    await closeDb().catch(() => {});
    process.exit(1);
  });
