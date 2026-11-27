import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts", "tests/**/*.test.mjs"], environment: "node", env: { LUMIERE_DATA_DIR: "memory", DATABASE_URL: "", LUMIERE_OFFICIAL_SOURCES: "0" }, testTimeout: 20000 },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
