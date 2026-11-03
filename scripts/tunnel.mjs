// pnpm tunnel
//
// Convex runs in the cloud, so it can only call n8n through a public URL.
// This starts a Cloudflare quick tunnel to the local n8n (no account needed),
// waits for its random https://*.trycloudflare.com address, and points Convex's
// N8N_WEBHOOK_URL at the request-notification webhook. Keep it running; the
// address changes on every start, so run this again after each restart.
// Requires `cloudflared` on PATH (winget install Cloudflare.cloudflared / brew install cloudflared).

import { spawn } from "node:child_process";
import { setConvexEnv } from "./convex-env.mjs";

const N8N_LOCAL = "http://localhost:5678";
const WEBHOOK_PATH = "/webhook/lendloop-loan-events"; // the WF1 Webhook node's path

const tunnel = spawn("cloudflared", ["tunnel", "--url", N8N_LOCAL], {
  stdio: ["ignore", "pipe", "pipe"],
});

tunnel.on("error", () => {
  console.error("cloudflared not found. Install it: winget install Cloudflare.cloudflared");
  process.exit(1);
});

let synced = false;
function onOutput(chunk) {
  if (synced) return;
  const match = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!match) return;
  synced = true;

  const webhookUrl = `${match[0]}${WEBHOOK_PATH}`;
  if (!setConvexEnv("N8N_WEBHOOK_URL", webhookUrl)) {
    console.error("Tunnel is up, but setting N8N_WEBHOOK_URL in Convex failed.");
    return;
  }
  console.log(`✔ Tunnel: ${match[0]} → ${N8N_LOCAL}`);
  console.log(`✔ Convex N8N_WEBHOOK_URL = ${webhookUrl}`);
  console.log("Keep this running. Ctrl+C stops the tunnel.");
}
tunnel.stdout.on("data", onOutput);
tunnel.stderr.on("data", onOutput); // cloudflared logs to stderr

tunnel.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => tunnel.kill(signal));
}
