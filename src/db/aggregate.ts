import "dotenv/config";
import { pool } from "./index";
import { ADAPTERS, runAggregation } from "@/lib/aggregators";

const key = process.argv[2] ?? "internet-archive";
const limit = Number(process.argv[3] ?? 40);
runAggregation(key, limit)
  .then((r) => {
    console.log(JSON.stringify({ ...r, errors: r.errors.slice(0, 5) }, null, 2));
    console.log("adapters:", ADAPTERS.map((a) => `${a.key}${a.configured() ? "" : " (not configured)"}`).join(", "));
    return pool.end();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
