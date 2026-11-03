# Running LendLoop in production

What I would change before real users depend on it. The core design (RBAC in Convex functions,
outbox + retries, signed and idempotent n8n calls) stays; most changes are about hosting,
operations and scale.

## Hosting and environments

- **Separate environments.** Convex production deployment (`npx convex deploy`), Clerk production
  instance on our own domain, n8n production instance. Preview deployments for pull requests.
- **n8n always on, at a fixed HTTPS address.** n8n Cloud, or self-hosted with a reverse proxy and
  TLS, Postgres instead of SQLite, and backups of its database (workflows, encrypted credentials,
  encryption key). For more load, n8n **queue mode** (main process + workers + Redis).
- **No tunnel.** `N8N_WEBHOOK_URL` points permanently at the production webhook.
- **Restrict n8n's network surface.** Only the webhook path is public; the editor sits behind SSO
  or a VPN. Allow-list Convex's outbound IPs on the webhook where the host supports it.
- **Workflows as code.** Keep the exported JSON in the repo as the source of truth, review changes
  in pull requests, and import them through the n8n API or CLI in CI rather than editing
  production by hand.

## Email

- A real transactional email provider instead of Mailpit: swap the SMTP credential in n8n, use a
  verified sending domain with SPF, DKIM and DMARC, and a real reply-to address.
- HTML templates with a plain-text part, an unsubscribe or notification-preferences link, and
  user-level preferences ("email me about new requests").

## Reliability

- **Don't depend on n8n being up at 09:00.** Either run WF2 hourly (safe: the overdue feed only
  returns loans not yet reminded today), or let a Convex cron call an n8n webhook so Convex owns
  the clock and its retries.
- **Retry failed emails.** The outbox retries the Convex → n8n hop; an email that fails inside n8n
  is recorded as failed but not re-sent. Let Convex re-queue a failed `notify:` event.
- **Verify the raw webhook body in WF1.** n8n re-serialises the JSON before checking the
  signature; it matches today because both sides use `JSON.stringify`, but enabling the Webhook
  node's raw body option removes that dependency.
- **Dead-letter handling.** An admin action to retry a failed notification after fixing the
  cause, and an alert when failures cross a threshold.
- **Exactly-once email is not guaranteed.** Delivery is at-least-once; WF1's "already sent?" check
  closes the common gap. A provider idempotency key per message (where supported) closes the rest.

## Security

- **Secret rotation.** Support two HMAC secrets during a rotation window (sign with the new one,
  accept both), then retire the old one. Separate secrets per direction (Convex → n8n and
  n8n → Convex) so one leak doesn't expose both.
- **Rate limiting** on the `/n8n/*` HTTP endpoints too (borrow requests and MCP calls already
  are), plus bot protection on sign-up.
- **Secrets off the command line.** The setup scripts pass secrets to `convex env set` as an
  argument (no shell, but briefly visible in the local process list); production sets them in the
  host's secret store.
- **Audit log** for admin actions (remove listing, Trusted Lender, role changes): who, what, when.
- **Admin access.** Require MFA for admins in Clerk; consider a separate admin app or route
  protection by Clerk role in addition to the Convex check.
- **Content safety.** Listing text is user-written: moderation and a report-listing flow.
- **Dependency and secret scanning** in CI (e.g. Dependabot, gitleaks).

## Connect Claude (MCP)

- **Public HTTPS URL.** Claude Desktop and claude.ai connect from the internet, so the hosted app
  (fixed domain) is required; localhost only works with Claude Code.
- **Scoped consent.** Today any valid Clerk OAuth token for the user gets every tool. Add
  separate scopes for read and write (and admin), so a user can let Claude browse without letting
  it approve or cancel, and check them per tool.
- **Client allow-list.** Only allow known MCP clients (Clerk CIMD pre-registered clients) instead
  of open dynamic registration.
- **Key rotation.** `pnpm mcp:setup --rotate` replaces the route's signing key; in production,
  publish two keys (old + new `kid`) during the switch, keep the private key in the host's secret
  store, and rotate on a schedule.
- **Anomaly alerts** on the MCP audit log (error spikes, rate-limit hits, unusual write volume),
  and an admin view across users (rows are already pruned after 90 days).
- **Opaque OAuth tokens.** Dev uses Clerk JWT access tokens (verified locally, valid until they
  expire). Opaque tokens can be revoked instantly at the cost of a Clerk call per request; switch
  to them if "disconnect now" must take effect immediately.
- **Human-in-the-loop** for destructive tools: return a confirmation step (MCP elicitation)
  before approve/decline/cancel instead of relying on the client to ask.

## Data and privacy

- **Retention policy** written down and enforced: automation log 30 days (done), n8n executions
  7 days (done), loan history N years, then anonymise.
- **Account deletion.** On user deletion, remove or anonymise their user row, listings and the
  names in loan search text; keep only what's legally required.
- **Per-user timezones** for "today" and "overdue" (currently UTC), plus reminder quiet hours.
- **Data processing agreements** with Clerk, Convex, the email provider and the n8n host.

## Observability

- Error tracking (e.g. Sentry) for the Next.js app and Convex functions; structured logs with a
  request id across Convex → n8n → write-back.
- Alerts on: outbox events reaching `failed`, n8n workflow errors (WF3), a run of 401s on
  `/n8n/*` (wrong secret or an attack), WF2 not running for 25 hours.
- Uptime checks on the app and the n8n webhook.

## Scale and performance

- **Counts** via `@convex-dev/aggregate` instead of capped reads (admin activity numbers, true
  page totals if numbered pagination with jump-to-page is wanted).
- **Search**: search text is a snapshot at request time; for renamed tools, refresh it in the
  update mutation or move to a dedicated search service if search grows.
- **Availability** per tool reads approved loans each time; at high volume, keep a
  denormalised "next available" field updated in the same transaction as approvals.

## Product follow-ups

- In-app notifications next to email; reminders before the due date, not only after.
- Pickup and return confirmation by the borrower too, with a dispute flow.
- Photos for listings (Convex file storage), neighbourhood radius, ratings after a loan.
