# Running LendLoop in production

What I would change before real users rely on it. The core design stays: RBAC in Convex
functions, an outbox with retries, and signed, idempotent calls between Convex and n8n.

## Hosting

- **Separate environments:** a Convex production deployment, a Clerk production instance on our
  own domain, the app on Vercel, and preview deployments per pull request.
- **n8n always on at a fixed HTTPS address** (n8n Cloud, or self-hosted with TLS, Postgres and
  backups). No tunnel; only the webhook path is public and the editor sits behind SSO.
- **Workflows as code:** the JSON in `n8n/` stays the source of truth and CI imports it, as
  `pnpm n8n:import` does locally, instead of editing production by hand.

## Email

- **Mailpit is for local development only.** Production sends through a transactional provider
  (e.g. Postmark, Resend, SES) via the same n8n SMTP credential, from a verified domain with SPF,
  DKIM and DMARC, and bounces written back to Convex from the provider's webhooks.

## Reliability

- **Don't depend on n8n at 09:00:** run reminders hourly (the overdue feed is idempotent per day)
  or let a Convex cron trigger them.
- **Re-send failed emails:** a failure inside n8n is recorded on the loan but not retried; add an
  admin action that re-queues it. A provider idempotency key per message closes the last
  duplicate gap of at-least-once delivery.

## Security

- **Secret rotation:** accept two HMAC secrets during a switch, use one secret per direction, and
  keep every secret in the host's secret store.
- **Admins:** MFA in Clerk and an audit log of admin actions. Rate limits on `/n8n/*` too, and
  dependency and secret scanning in CI.
- **Connect Claude:** read and write OAuth scopes checked per tool, an allow-list of known MCP
  clients, and a confirmation step before approve, decline or cancel.

## Privacy

- **Retention policy** written down: automation log 30 days and n8n executions 7 days are already
  enforced; old loan history gets anonymised.
- **Account deletion** removes or anonymises the user's row, listings and names in loan search.
- **Per-user timezones** for "today" and "overdue" (UTC today), and data processing agreements
  with Clerk, Convex, the email provider and the n8n host.

## Observability

- **Error tracking** (e.g. Sentry) for the app and Convex functions, with one request id across
  Convex → n8n → write-back.
- **Alerts** on outbox events reaching `failed`, n8n workflow errors, bursts of 401s on `/n8n/*`
  and reminders not running for 25 hours; uptime checks on the app and the webhook.
