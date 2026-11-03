import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerTools } from "@/lib/mcp/tools";

// MCP endpoint for Claude. Claude signs in with the user's LendLoop (Clerk)
// account through OAuth in the browser; there are no API keys. Each tool then
// calls Convex as that user (see lib/mcp/convex-as-user.ts).

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "lendloop", version: "1.0.0" },
  instructions:
    "LendLoop is a neighbourhood tool-lending app. You act as the signed-in user: " +
    "browse and list tools, request to borrow, and manage requests. Dates are YYYY-MM-DD. " +
    "Confirm with the user before approving, declining or cancelling a request.",
});

const authHandler = withMcpAuth(
  handler,
  async (_req, token) => verifyClerkToken(await auth({ acceptsToken: "oauth_token" }), token),
  { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp" },
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
