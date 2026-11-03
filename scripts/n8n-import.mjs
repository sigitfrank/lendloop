// pnpm n8n:import
//
// Sets up n8n from the repo in one go (run after `pnpm n8n:setup` and
// `docker compose up -d`, and after creating the n8n owner account):
//  1. creates the two credentials the workflows use, by fixed id:
//     "LendLoop HMAC secret" (Crypto, from .n8n-hmac-secret) and "Mailpit SMTP"
//  2. imports the 3 workflows from n8n/ with fixed ids, links the error
//     workflow to the other two, and publishes all three
//  3. restarts n8n so the published workflows (and the webhook) go live
// Safe to re-run: the same ids are updated in place. The secret is passed to
// the container on stdin, never printed or put on a command line, and the
// temporary file inside the container is deleted right after the import.
// Options:
//   --container <name>    target another container (default: compose service "n8n")
//   --secret-file <path>  default .n8n-hmac-secret

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const secretFile = arg("--secret-file") ?? ".n8n-hmac-secret";

const IDS = {
  error: "lendloopErrorWf1",
  notify: "lendloopNotifyWf",
  remind: "lendloopRemindWf",
};
const WORKFLOWS = [
  { file: "n8n/error-workflow.json", id: IDS.error },
  { file: "n8n/request-notification.json", id: IDS.notify, errorWorkflow: true },
  { file: "n8n/overdue-reminders.json", id: IDS.remind, errorWorkflow: true },
];

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: "utf8" });
  if (result.error) fail(`${command} failed: ${result.error.message}`);
  return result;
}

/** Runs a shell snippet inside the n8n container as the n8n user. */
function inContainer(container, script, input) {
  return run("docker", ["exec", "-i", "-u", "node", container, "sh", "-c", script], input);
}

/** Writes stdin to a temp file in the container, runs an n8n command on it, deletes it. */
function importFile(container, command, json) {
  const file = `/tmp/lendloop-${command.replace(":", "-")}.json`;
  const result = inContainer(
    container,
    `cat > ${file} && n8n ${command} --input=${file}; rc=$?; rm -f ${file}; exit $rc`,
    JSON.stringify(json),
  );
  if (result.status !== 0) fail(`n8n ${command} failed:\n${result.stdout}${result.stderr}`);
}

// ── Preconditions ───────────────────────────────────────────────────────────

if (!existsSync(secretFile)) fail(`${secretFile} not found. Run \`pnpm n8n:setup\` first.`);
const secret = readFileSync(secretFile, "utf8").trim();
if (!secret) fail(`${secretFile} is empty. Run \`pnpm n8n:setup\` first.`);

const container = arg("--container") ?? run("docker", ["compose", "ps", "-q", "n8n"]).stdout.trim();
if (!container) fail("n8n isn't running. Start it with `docker compose up -d`.");

// Workflows imported by hand get random ids; a second copy would fight over the
// same webhook path, so ask for those to be deleted first.
const listed = inContainer(container, "n8n list:workflow 2>/dev/null").stdout;
const ours = new Set(Object.values(IDS));
const names = new Set(WORKFLOWS.map(({ file }) => JSON.parse(readFileSync(file, "utf8")).name));
const strays = listed
  .split("\n")
  .map((line) => line.split("|"))
  .filter(([id, name]) => id && names.has(name?.trim()) && !ours.has(id.trim()));
if (strays.length > 0) {
  fail(
    "These LendLoop workflows were imported by hand. Delete them in n8n (and empty the archive), then re-run:\n" +
      strays.map(([id, name]) => `  - ${name.trim()} (${id.trim()})`).join("\n"),
  );
}

// ── 1. Credentials ──────────────────────────────────────────────────────────

importFile(container, "import:credentials", [
  {
    id: "lendloopHmacSecret",
    name: "LendLoop HMAC secret",
    type: "crypto",
    data: { hmacSecret: secret },
  },
  {
    id: "lendloopMailpitSmtp",
    name: "Mailpit SMTP",
    type: "smtp",
    data: {
      host: "mailpit",
      port: 1025,
      secure: false,
      disableStartTls: true,
      user: "",
      password: "",
    },
  },
]);
console.log("✔ Credentials: LendLoop HMAC secret (not shown), Mailpit SMTP");

// ── 2. Workflows ────────────────────────────────────────────────────────────

importFile(
  container,
  "import:workflow",
  WORKFLOWS.map(({ file, id, errorWorkflow }) => {
    const workflow = JSON.parse(readFileSync(file, "utf8"));
    return {
      ...workflow,
      id,
      settings: { ...workflow.settings, ...(errorWorkflow ? { errorWorkflow: IDS.error } : {}) },
    };
  }),
);
for (const { id } of WORKFLOWS) {
  const result = inContainer(container, `n8n publish:workflow --id=${id}`);
  if (result.status !== 0) fail(`Publishing ${id} failed:\n${result.stdout}${result.stderr}`);
}
console.log("✔ Workflows imported, error workflow linked, all three published");

// ── 3. Restart so the published workflows go live ───────────────────────────

if (run("docker", ["restart", container]).status !== 0) fail("Couldn't restart n8n.");
console.log("✔ n8n restarted: http://localhost:5678");
console.log("Next: pnpm tunnel");
