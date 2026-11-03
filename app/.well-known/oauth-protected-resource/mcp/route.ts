import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandlerClerk,
} from "@clerk/mcp-tools/next";

// RFC 9728: tells Claude that /mcp is protected by our Clerk instance, so it
// can start the browser sign-in (OAuth) flow.
const handler = protectedResourceHandlerClerk({ scopes_supported: ["profile", "email"] });
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
