import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node", env: { LUMIERE_DATA_DIR: "memory" }, testTimeout: 20000 },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
