import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Runs the project's Convex CLI with Node directly (no shell), so values such
// as the HMAC secret are passed as real arguments, never through a command line
// that a shell would re-parse.
const CONVEX_CLI = fileURLToPath(new URL("../node_modules/convex/bin/main.js", import.meta.url));

/** Sets an env var on the current Convex deployment. Returns true on success. */
export function setConvexEnv(name, value) {
  const result = spawnSync(process.execPath, [CONVEX_CLI, "env", "set", name, value], {
    stdio: ["ignore", "ignore", "inherit"], // stdout ignored; never echoes the value
  });
  return result.status === 0;
}
