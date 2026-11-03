// Shared by Convex (auth.config.ts, lib/auth.ts) and the Next.js MCP route.
//
// The MCP route verifies the user's Clerk OAuth token, then calls Convex with
// a 60-second token it signs itself (ES256). Convex accepts that token only
// with this issuer and audience, and maps it to the same user row the browser
// uses, so every MCP call runs through the normal RBAC helpers.

export const MCP_TOKEN_ISSUER = "https://mcp.lendloop.local";
export const MCP_TOKEN_AUDIENCE = "lendloop-mcp";
export const MCP_TOKEN_KEY_ID = "lendloop-mcp-1";
export const MCP_TOKEN_TTL_SECONDS = 60;
