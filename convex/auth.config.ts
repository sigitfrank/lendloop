import type { AuthConfig } from "convex/server";
import { MCP_TOKEN_AUDIENCE, MCP_TOKEN_ISSUER } from "./lib/mcp";

// Both values are set in the Convex dashboard / CLI, not in .env.local.
export default {
  providers: [
    // Browser sessions: Clerk JWTs for the "convex" audience.
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
    // Claude (MCP): 60-second tokens signed by our MCP route after it verified
    // the user's Clerk OAuth token. Public key from `pnpm mcp:setup`.
    {
      type: "customJwt",
      issuer: MCP_TOKEN_ISSUER,
      applicationID: MCP_TOKEN_AUDIENCE,
      jwks: process.env.MCP_JWKS!,
      algorithm: "ES256",
    },
  ],
} satisfies AuthConfig;
