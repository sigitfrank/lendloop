// pnpm mcp:setup
//
// Creates the key pair the MCP route uses to call Convex as the signed-in user:
//  - private key (ES256, PKCS8) → .env.local as MCP_JWT_PRIVATE_KEY (base64, git-ignored)
//  - public key (JWKS)          → Convex env MCP_JWKS (public by design: Convex
//    uses it to verify the route's short-lived tokens)
// Keeps an existing key unless --rotate is passed. Never prints the private key.

import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { setConvexEnv } from "./convex-env.mjs";

const ENV_FILE = ".env.local";
const KEY_NAME = "MCP_JWT_PRIVATE_KEY";
const KEY_ID = "lendloop-mcp-1"; // matches convex/lib/mcp.ts
const rotate = process.argv.includes("--rotate");

const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : [];
const existing = lines.find((line) => line.startsWith(`${KEY_NAME}=`))?.slice(KEY_NAME.length + 1);

let privateKey;
if (existing && !rotate) {
  privateKey = createPrivateKey(Buffer.from(existing, "base64").toString("utf8"));
} else {
  privateKey = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const line = `${KEY_NAME}=${Buffer.from(pem).toString("base64")}`;
  const kept = lines.filter((l) => !l.startsWith(`${KEY_NAME}=`));
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  writeFileSync(
    ENV_FILE,
    [...kept, "", "# MCP token signing key (pnpm mcp:setup)", line, ""].join("\n"),
  );
}

const jwk = {
  ...createPublicKey(privateKey).export({ format: "jwk" }),
  kid: KEY_ID,
  alg: "ES256",
  use: "sig",
};
const jwks = `data:text/plain;charset=utf-8;base64,${Buffer.from(JSON.stringify({ keys: [jwk] })).toString("base64")}`;

if (!setConvexEnv("MCP_JWKS", jwks)) {
  console.error("Could not set MCP_JWKS in Convex (is `pnpm convex dev` set up?).");
  process.exit(1);
}

console.log(
  `✔ MCP signing key ${existing && !rotate ? "kept" : "generated"} → ${ENV_FILE} (${KEY_NAME}, not shown)`,
);
console.log("✔ Public key set in Convex (MCP_JWKS)");
console.log("Restart `pnpm dev` so Next.js picks up the key.");
