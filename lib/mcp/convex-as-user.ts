import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import {
  MCP_TOKEN_AUDIENCE,
  MCP_TOKEN_ISSUER,
  MCP_TOKEN_KEY_ID,
  MCP_TOKEN_TTL_SECONDS,
} from "@/convex/lib/mcp";

// The MCP route has already verified the user's Clerk OAuth token. To call
// Convex *as that user*, it signs a 60-second ES256 JWT that Convex trusts as a
// second issuer (convex/auth.config.ts) and maps to the user's existing row.
// No service account, no bypass: Convex's own RBAC checks run on every call.

let cachedKey: KeyObject | undefined;

function signingKey(): KeyObject {
  if (cachedKey) return cachedKey;
  const encoded = process.env.MCP_JWT_PRIVATE_KEY;
  if (!encoded) throw new Error("MCP_JWT_PRIVATE_KEY is not set. Run `pnpm mcp:setup`.");
  cachedKey = createPrivateKey(Buffer.from(encoded, "base64").toString("utf8"));
  return cachedKey;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

function convexTokenFor(clerkUserId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: MCP_TOKEN_KEY_ID }));
  const payload = base64url(
    JSON.stringify({
      iss: MCP_TOKEN_ISSUER,
      aud: MCP_TOKEN_AUDIENCE,
      sub: clerkUserId,
      iat: now,
      exp: now + MCP_TOKEN_TTL_SECONDS,
    }),
  );
  // ES256 JWTs use the raw r||s signature format, not DER.
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: signingKey(),
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${base64url(signature)}`;
}

/** A Convex client that acts as the given Clerk user for one request. */
export function convexAsUser(clerkUserId: string): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set.");
  const client = new ConvexHttpClient(url);
  client.setAuth(convexTokenFor(clerkUserId));
  return client;
}
