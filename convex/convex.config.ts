import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

// Typed environment variables, read via `env` from ./_generated/server.
// Optional so the app deploys before n8n / MCP are set up; code that needs
// them fails with a clear message. Set with `pnpm convex env set ...`.
const app = defineApp({
  env: {
    /** Clerk Frontend API URL; the issuer of browser sessions (see auth.config.ts). */
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    /** Shared secret for HMAC-signing requests between Convex and n8n. */
    LENDLOOP_HMAC_SECRET: v.optional(v.string()),
    /** n8n webhook that receives loan events (request created / status changed). */
    N8N_WEBHOOK_URL: v.optional(v.string()),
    /** Public key set of the MCP route's token signer (`pnpm mcp:setup`). */
    MCP_JWKS: v.optional(v.string()),
  },
});

// Per-user limits on MCP tool calls (convex/mcp.ts).
app.use(rateLimiter);

export default app;
