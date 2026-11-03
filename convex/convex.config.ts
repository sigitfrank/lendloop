import { defineApp } from "convex/server";
import { v } from "convex/values";

// Typed environment variables, read via `env` from ./_generated/server.
// Optional so the app deploys before n8n is set up; code that needs them fails
// with a clear message (see lib/n8n.ts). Set with `pnpm convex env set ...`.
const app = defineApp({
  env: {
    /** Shared secret for HMAC-signing requests between Convex and n8n. */
    LENDLOOP_HMAC_SECRET: v.optional(v.string()),
    /** n8n webhook that receives loan events (request created / status changed). */
    N8N_WEBHOOK_URL: v.optional(v.string()),
  },
});

export default app;
