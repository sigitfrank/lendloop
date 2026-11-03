import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Matches the Convex runtime more closely than Node (per convex-test docs).
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
  },
});
