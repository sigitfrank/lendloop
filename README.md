# LendLoop

**Borrow what you need. Lend what you don't.**

LendLoop is a neighbourhood tool-lending board. Neighbours list tools they rarely use, others
request them for a date range, and the lender approves, declines and marks them returned. Email
notifications and daily overdue reminders run through **n8n**, connected to the app with signed,
idempotent, retried calls in both directions. Users can also **connect Claude** (MCP) with
their own LendLoop sign-in, no API keys, and let it lend and borrow for them.

Built for the Fluence Full-Stack Developer take-home with **Next.js (App Router) + TypeScript,
Clerk, Convex and n8n**.

---

## Contents

1. [Features](#features)
2. [Stack and why](#stack-and-why)
3. [Local setup](#local-setup)
4. [Environment variables](#environment-variables)
5. [Architecture](#architecture)
6. [Roles and permissions (RBAC)](#roles-and-permissions-rbac)
7. [Security decisions](#security-decisions)
8. [Data minimisation](#data-minimisation)
9. [Integration reliability (n8n)](#integration-reliability-n8n)
10. [Connect Claude (MCP)](#connect-claude-mcp)
11. [Testing](#testing)
12. [Design decisions and trade-offs](#design-decisions-and-trade-offs)
13. [Project structure](#project-structure)
14. [Built with AI assistance](#built-with-ai-assistance)

Production changes are in [PRODUCTION.md](PRODUCTION.md).

---

## Features

**Signed out:** the landing page shows the LendLoop name, tagline, a read-only list of available
tools (**name and category only**, server-rendered from Convex) and "Sign in to lend or borrow".

**Signed in:**

- **Browse tools** with live availability ("Available", "On loan until 12 Nov", "Overdue"),
  category filter, server-side search and sort, infinite scroll.
- **List a tool:** name, category, condition, short description and an optional icon.
- **Request to borrow** with a date-range calendar that blocks past and already-booked days
  (max 30 days).
- **My listings, My requests, Incoming requests:** grid or table, status filter, search, sort.
  Owners approve or decline and mark loans returned; borrowers cancel pending requests.
- **Loan timeline:** each loan shows its history in plain words, merging the lifecycle with
  automation activity ("Approval notification sent 5 minutes ago", "Overdue reminder sent today",
  "Request notification retrying (attempt 2 of 5)"). This is the brief's bonus.
- **Admin:** all loans, remove any listing, mark Trusted Lenders, and an **Automation log** of
  every HTTP call between Convex and n8n (status filter, search, kept 30 days).
- **Connect Claude:** an MCP server so Claude can search tools, list, request, approve and
  return as the signed-in user. Sign-in is OAuth in the browser; every action goes through the
  same permission checks, is rate limited and shows up in "Recent activity".

All lists update live (Convex subscriptions over a WebSocket); there is no refresh button.

## Stack and why

| Layer          | Tool                                         | Why                                                                                              |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Framework      | Next.js 16 (App Router), TypeScript          | Required. Server components for the shell, client components only where interactive.             |
| Auth           | Clerk (Core 3)                               | Required. Convex trusts Clerk's JWT (`aud: "convex"`).                                           |
| Data + backend | Convex                                       | Required. Typed queries/mutations, transactions, scheduler, crons, HTTP actions, search indexes. |
| Automation     | n8n 3.1 (Docker)                             | Required. Request notifications, daily reminders, error workflow.                                |
| UI             | Tailwind 4 + shadcn/ui (Radix), lucide icons | Accessible primitives (dialogs, menus, calendar) without hand-rolling them.                      |
| Local email    | Mailpit (Docker)                             | A local inbox, so notifications are visible without an email provider.                           |
| Tests          | Vitest + convex-test                         | Runs the real Convex functions as different users.                                               |

**Deliberately not used:** no Redux/Zustand/React Query. Convex `useQuery` is already a live,
cached source of truth; list state (search, filters, sort, view) lives in the URL. No Redis or
separate queue: the Convex **outbox + scheduler** is the queue.

---

## Local setup

### Prerequisites

- Node.js **22.12+** (Convex 1.49 and Vitest 5 require it) and **pnpm**
- **Docker Desktop** (runs n8n + Mailpit, about 1.3 GB of images on first run)
- **cloudflared** for the public tunnel: `winget install Cloudflare.cloudflared` or
  `brew install cloudflared` (no Cloudflare account needed)
- Free accounts: [Clerk](https://dashboard.clerk.com) and [Convex](https://dashboard.convex.dev)

### 1. Install

```bash
git clone <this repo> lendloop && cd lendloop
pnpm install
```

### 2. Clerk

1. Create an application (email sign-in is enough).
2. Open **Integrations → Convex** (`https://dashboard.clerk.com/apps/setup/convex`) and
   **Activate**. This adds `aud: "convex"` to Clerk's session token. Copy the **Frontend API URL**.
3. **Sessions → Customize session token**, set the claims to:
   ```json
   {
     "aud": "convex",
     "name": "{{user.full_name}}",
     "email": "{{user.primary_email_address}}"
   }
   ```
   Convex reads `name` and `email` from here (the email is only used to notify the user themselves).
4. **API keys:** copy [`.env.example`](.env.example) to `.env.local`, then fill in the
   publishable and secret key (the other values are written by the commands below):
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

### 3. Convex

```bash
pnpm convex dev
```

Sign in, create a project (cloud dev deployment). This writes `CONVEX_DEPLOYMENT`,
`NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` to `.env.local`. The first push stops
because two Convex env vars aren't set yet (the Clerk issuer and the MCP public key). Run both
commands below, then run `pnpm convex dev` again and keep it running:

```bash
pnpm convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-instance>.clerk.accounts.dev
pnpm mcp:setup
```

`pnpm mcp:setup` creates the key pair the MCP route uses to call Convex as the signed-in user
(see [Connect Claude](#connect-claude-mcp)): the private key goes to `.env.local`
(`MCP_JWT_PRIVATE_KEY`, never printed), the public key to Convex (`MCP_JWKS`). Convex refuses to
push until both env vars exist.

### 4. Run the app

```bash
pnpm dev            # http://localhost:3000
```

Sign up, open **Browse tools**: your user row is created on first sign-in with role `user`.

**Make yourself admin** (only possible from the CLI, never from the browser):

```bash
pnpm convex run users:setRole '{"email":"you@example.com","role":"admin"}'
```

On Windows, run that line in Git Bash (PowerShell and cmd mangle the JSON quotes), or use the
Convex dashboard: **Functions → users:setRole → Run** with the same arguments.

Use a second account (e.g. a private window) to borrow from the first.

**Demo data (optional):** with your two accounts (one admin, one user), the user account gets
20 listings and the admin asks to borrow each once, so both views fill up with loans in every
state (pending, on loan, upcoming, overdue, returned, declined, cancelled) and their automation
history. No emails are sent.

```bash
pnpm convex run devSeed:demoData    # remove again with devSeed:clearDemo
```

### 5. n8n + Mailpit

Convex runs in the cloud, so it can only reach n8n through a public URL; a Cloudflare quick tunnel
provides one.

```bash
pnpm n8n:setup                 # add --app-url http://localhost:3001 if the app runs elsewhere
docker compose up -d           # n8n http://localhost:5678 · Mailpit http://localhost:8025
```

Open n8n (http://localhost:5678) and **create the local owner account first**: the tunnel below
makes n8n reachable from the internet, so don't start it while n8n is still unclaimed. Then:

```bash
pnpm tunnel                    # own terminal, keep it running
```

- `pnpm n8n:setup` generates the shared HMAC secret, stores it in Convex
  (`LENDLOOP_HMAC_SECRET`) and in git-ignored `.n8n-hmac-secret`, and writes `n8n.env` with the
  non-secret settings. It never prints the secret.
- `pnpm tunnel` starts the tunnel and points Convex's `N8N_WEBHOOK_URL` at it. The quick-tunnel
  address changes on every start, so run it again after a restart.

In n8n:

1. **Credentials** (**＋ → Credential**):
   - **Crypto**, named exactly `LendLoop HMAC secret`. **Hmac Secret** = the contents of
     `.n8n-hmac-secret`. Leave the other fields empty.
   - **SMTP**, named exactly `Mailpit SMTP`. Host `mailpit`, port `1025`, SSL/TLS off, no user or
     password.
2. **Import** each file in [`n8n/`](n8n), error workflow first (**＋ → Workflow → ⋯ → Import JSON**,
   then save): `error-workflow.json`, `request-notification.json`, `overdue-reminders.json`.
   Credentials link by name.
3. In **Request notification** and **Overdue reminders**: **⋯ → Settings → Error workflow →
   LendLoop · Error reporter**.
4. **Publish** all three.

**Try it:** request a tool from the second account; Mailpit shows "\<name\> wants to borrow your
\<tool\>" within seconds. Approve it and the borrower gets "… approved your request".

**Overdue reminders:** the UI can't create a loan in the past, so seed one, then run
**Overdue reminders** in n8n with **Execute**:

```bash
pnpm convex run devSeed:overdueLoan
```

Run it again: no second email (one reminder per loan per day).

### 6. Connect Claude (MCP)

One-time, in the Clerk dashboard: **Configure → OAuth applications → Settings**, turn on
**dynamic client registration** (DCR, and CIMD if offered) so Claude can register itself, and
set the default scopes to `openid profile email`.

Then, signed in to LendLoop, open **Connect Claude** and copy the command, e.g.:

```bash
claude mcp add --transport http lendloop http://localhost:3000/mcp
```

In Claude Code run `/mcp`, pick **lendloop**, and sign in with your LendLoop account in the
browser. Try "find a drill I can borrow this weekend". Claude Desktop and claude.ai connect from
the internet, so they need the app on a public HTTPS URL (Settings → Connectors → Add custom
connector).

### 7. Tests

```bash
pnpm test        # 42 tests, ~1 s
pnpm typecheck   # generates Next.js route types, then tsc
pnpm lint
pnpm format:check # Prettier (pnpm format fixes; also runs on every commit via husky + lint-staged)
```

---

## Environment variables

No values are committed. `.env*`, `n8n.env` and `.n8n-hmac-secret` are git-ignored;
[`.env.example`](.env.example) and [`n8n.env.example`](n8n.env.example) list the names.

| Name                                | Where                                  | Purpose                                       | Secret  |
| ----------------------------------- | -------------------------------------- | --------------------------------------------- | ------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local`                           | Clerk in the browser                          | no      |
| `CLERK_SECRET_KEY`                  | `.env.local`                           | Clerk on the Next.js server                   | **yes** |
| `CONVEX_DEPLOYMENT`                 | `.env.local` (written by `convex dev`) | Which deployment the CLI targets              | no      |
| `NEXT_PUBLIC_CONVEX_URL`            | `.env.local` (written by `convex dev`) | Convex client URL                             | no      |
| `NEXT_PUBLIC_CONVEX_SITE_URL`       | `.env.local` (written by `convex dev`) | Convex HTTP actions URL (used by `n8n:setup`) | no      |
| `CLERK_JWT_ISSUER_DOMAIN`           | Convex env                             | Issuer Convex trusts for Clerk JWTs           | no      |
| `LENDLOOP_HMAC_SECRET`              | Convex env + n8n Crypto credential     | Signs/verifies every Convex ↔ n8n request     | **yes** |
| `N8N_WEBHOOK_URL`                   | Convex env (set by `pnpm tunnel`)      | Where Convex delivers loan events             | no      |
| `MCP_JWT_PRIVATE_KEY`               | `.env.local` (written by `mcp:setup`)  | Signs the MCP route's 60 s tokens for Convex  | **yes** |
| `MCP_JWKS`                          | Convex env (set by `mcp:setup`)        | Public key Convex verifies those tokens with  | no      |
| `LENDLOOP_CONVEX_URL`               | `n8n.env`                              | Base URL n8n calls (`/n8n/*`)                 | no      |
| `LENDLOOP_APP_URL`                  | `n8n.env`                              | Links in emails                               | no      |

Convex variables are declared and typed in [`convex/convex.config.ts`](convex/convex.config.ts).

---

## Architecture

```
Browser (Next.js App Router, Clerk session)
   │  Convex React client over one WebSocket: live queries, mutations
   ▼
Convex (cloud)
   ├─ queries / mutations   every one: authenticate → authorise → validate → act
   ├─ outbox + scheduler    loan change + event in one transaction; delivery with backoff
   ├─ HTTP actions /n8n/*   HMAC-verified; idempotent write-backs; every call logged
   └─ crons                 log retention, stale-request expiry, stuck-delivery sweep
   ▲                 │
   │ signed GET/POST │ signed POST (loan event)
   │                 ▼
n8n (Docker, public via tunnel) ── SMTP ──► Mailpit (local inbox)
   ├─ WF1 Request notification   Webhook trigger
   ├─ WF2 Overdue reminders      Schedule trigger, daily 09:00 UTC
   └─ WF3 Error reporter         Error trigger for WF1/WF2
```

**Event flows**

```
Request / approve / decline / cancel / return
  → Convex mutation: loan row + outbox row (one transaction)
  → scheduler → action: signed POST to n8n                        (retry 1m, 5m, 15m, 1h)
  → WF1: verify signature (401 if not) → 202 → "already sent?" check → email via Mailpit
  → signed write-back /n8n/notification-status (sent | failed)    (idempotent by key)

Every day 09:00 UTC (n8n's own schedule)
  → WF2: signed GET /n8n/overdue-loans  (only loans not yet reminded today)
  → one email per borrower → signed write-back /n8n/reminder-status per loan

Any failed WF1/WF2 run
  → WF3: signed POST /n8n/automation-error → visible in Admin → Automation log
```

Convex decides and records; n8n executes side effects (emails) and reports back. n8n stores no
LendLoop data: it gets what one run needs and nothing else.

---

## Roles and permissions (RBAC)

Enforced inside Convex functions through shared helpers in
[`convex/lib/auth.ts`](convex/lib/auth.ts) (`requireUser`, `requireAdmin`, `requireToolOwner`,
`requireLoanParty`). The Next.js redirect for signed-out users and the admin page's server-side
404 are UX on top, not the security boundary.

| Action                                                                    | Who        | Extra checks                                                                                                                     |
| ------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Public tool list                                                          | anyone     | active tools only; returns `name` + `category` only                                                                              |
| Browse with availability                                                  | signed in  |                                                                                                                                  |
| Create a listing                                                          | user       | owner is always the caller, never a client-supplied id                                                                           |
| Edit / delete a listing                                                   | owner      | delete is a soft delete, blocked while a loan is pending or approved                                                             |
| Request to borrow                                                         | user       | not own tool; tool active; start ≥ today, end ≥ start, ≤ 30 days; one pending request per tool; no overlap with an approved loan |
| Cancel a request                                                          | borrower   | only while pending                                                                                                               |
| Approve / decline                                                         | tool owner | only pending; approve re-checks overlap **in the same transaction**; start date not passed                                       |
| Mark returned                                                             | tool owner | only approved (the lender confirms they got it back)                                                                             |
| View all loans, remove any listing, Trusted Lender, users, automation log | admin      | role read from the users table on every call                                                                                     |
| Change a role                                                             | CLI only   | `users:setRole` is an **internal** function; the browser can't call it                                                           |

New users always start as `user`. The role lives in Convex, never in the client or Clerk metadata.
Loans that belong to someone else return the same "doesn't exist" error as missing ones, so their
existence isn't revealed.

---

## Security decisions

- **Authenticate → authorise → validate → act** in every public function. Every function declares
  argument **and** return validators; enums are literal unions; text is trimmed and length-limited
  (name 60, description 500, search 100).
- **Generic errors to clients.** User-facing errors are `ConvexError` messages written for users;
  anything unexpected becomes "Something went wrong". HTTP endpoints return 400/401/500 without
  internals (details go to Convex logs).
- **HMAC in both directions.** HMAC-SHA256 over `"{timestamp}.{METHOD}.{path?query}.{rawBody}"`,
  headers `X-LendLoop-Timestamp` and `X-LendLoop-Signature`.
  - Binding method + path means a signature for one endpoint can't be replayed on another.
  - **5-minute replay window** on the timestamp.
  - **Constant-time comparison:** `crypto.subtle.verify` in Convex; an XOR loop in n8n.
  - Bad or old signatures get **401 before any database access** (not even a log row).
- **Rate limits** (Convex rate-limiter component, per user): borrow requests 20/hour (each one
  emails a lender, so a request/cancel loop can't flood an inbox) and MCP tool calls 60/minute.
- **Bounded reads.** Client page sizes are capped at 50 on the server; per-tool loan checks and
  feeds read bounded, index-backed ranges.
- **Secrets.** Only in Convex env and an **encrypted n8n Crypto credential**. Not in code, not in
  the exported workflow JSON (checked against the real value), and **not in n8n's container
  environment**, so no workflow can read it through `$env`. Scripts set Convex env by calling the
  Convex CLI without a shell, so the secret is never re-parsed by a command line.
- **Least exposure.** Public landing data is name + category. Admin-only data (emails, error
  details) only appears in admin queries.
- **Soft deletes** keep loan history consistent (a removed listing never orphans a loan).

## Data minimisation

| Data flow                | Contains                                                                                                | Deliberately excluded                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Public tool list         | tool id, name, category                                                                                 | owner, description, availability                     |
| Tool cards (signed in)   | tool fields, availability, lender's **first name**, Trusted Lender flag                                 | emails, other borrowers                              |
| Loan views               | dates, status, tool, **first names** of lender and borrower, activity status                            | emails; error details (admins only)                  |
| Convex → n8n webhook     | event, status, loan id + dates, tool name, **recipient's** first name + email, other party's first name | description, the other party's email, any other user |
| `GET /n8n/overdue-loans` | loan id, tool name, end date, **borrower's** first name + email, idempotency key                        | lender's email, description                          |
| Error reports from n8n   | workflow, node, message, execution id                                                                   | item data                                            |
| Automation log           | method, path, status, duration, tool name, short message                                                | payloads, emails, secrets                            |
| Clerk session token      | `name`, `email` claims                                                                                  | only used to keep the user's own row current         |

n8n's own execution history contains recipient emails, so **n8n prunes executions after 7 days**
(`EXECUTIONS_DATA_PRUNE`, `EXECUTIONS_DATA_MAX_AGE=168`), and the Convex automation log is pruned
after 30 days by a cron.

---

## Integration reliability (n8n)

- **Outbox pattern.** A loan change and its notification event are written in **one Convex
  transaction**: no change without an event, no event without a change. Delivery runs afterwards
  in a scheduled action.
- **Retries with backoff.** 1 min, 5 min, 15 min, 1 h; after 5 attempts the event is marked
  **failed** and recorded, so it shows on the loan ("… failed") and in the admin log. Never silent.
- **Idempotency keys** make every retry safe:
  - `notify:{loanId}:{status}`: one notification per status change. WF1 also asks Convex
    "already sent?" before emailing, so a re-delivered event doesn't email twice.
  - `overdue:{loanId}:{YYYY-MM-DD}`: at most one reminder per loan per day; the overdue feed
    excludes loans already reminded.
  - `error:{executionId}`: one row per failed n8n execution.

  Write-backs upsert by key: replaying returns `duplicate: true` and changes nothing; "sent" is
  never downgraded. Verified by tests and by re-running WF2 by hand.

- **n8n side:** every HTTP node retries 3× (3 s apart); email nodes route failures to a
  "write-back: failed" branch; **WF3** (error workflow) reports any failed execution to Convex.
  A failed email is recorded as **failed** on the loan and in the log; it isn't re-sent
  automatically (the Convex → n8n hop retries, the email step inside n8n doesn't).
- **Safety nets.** Delivery has a 10 s timeout; a cron re-queues any delivery that never
  recorded an attempt, so nothing stays "pending" silently. Unsigned calls get 401 and are not
  logged (no database write), so the log can't be flooded from outside.
- **Visibility.** Each loan's timeline shows sent / failed / retrying. **Admin → Automation log**
  records every HTTP call in both directions (status code, duration, message), filterable by
  status (Failed, n8n workflow errors, 200, 202, 400, 401, 404, 500, 503, network error) and
  searchable.

---

## Connect Claude (MCP)

Claude (Claude Code, Desktop or claude.ai) can act on LendLoop **as the signed-in user, under the
same RBAC**. There are **no API keys**: Claude signs in with the user's LendLoop account in the
browser (OAuth 2.1 + PKCE, Clerk as the authorisation server).

```
Claude ── OAuth sign-in in the browser (Clerk) ──► access token
   │  POST /mcp   Authorization: Bearer <Clerk OAuth token>
   ▼
Next.js /mcp   (mcp-handler, stateless Streamable HTTP)
   │  1. verify the token with Clerk → Clerk user id     (401 + resource metadata if missing)
   │  2. validate the tool input (zod)
   │  3. sign a 60-second ES256 token for that user (sub = Clerk user id)
   ▼
Convex   (second auth provider, customJwt)
   │  mcp.startCall    rate limit (60/min, burst 20) + audit row
   │  the SAME public function the UI calls (requireUser / owner / admin checks)
   │  mcp.finishCall   ok / error + duration
```

- **One identity, one permission path.** The token's subject is the Clerk user id;
  [`convex/lib/auth.ts`](convex/lib/auth.ts) maps it onto the user's existing row. No service
  account, no bypass, no second permission model. A Claude token can't create a user (sign in to
  the app once first).
- **Short-lived and one-way.** Tokens Convex accepts from the route live 60 seconds and are signed
  with a key only the Next.js server holds; Convex has only the public key. To disconnect:
  **Clear authentication** in Claude.
- **Guardrails.** Per-user rate limit (Convex rate-limiter component). Audit log of tool name,
  outcome and duration (no arguments or free text), shown under **Connect Claude → Recent
  activity**. Errors reaching Claude are the same user-safe messages as the UI. Tools carry
  read-only / destructive annotations, and the server instructions ask Claude to confirm before
  approving, declining or cancelling.
- **Prompt injection.** Listing names and descriptions are user-written. They return as JSON data
  fields, and no tool can do more than the user could in the UI.
- **Data minimisation.** The same views as the UI (first names, no emails).

| Tool                                                                                        | Kind  |
| ------------------------------------------------------------------------------------------- | ----- |
| `search_tools`, `list_my_listings`, `list_my_requests`, `list_incoming_requests`            | read  |
| `create_listing`, `request_borrow`, `cancel_request`, `respond_to_request`, `mark_returned` | write |
| `admin_list_loans` (Convex refuses non-admins)                                              | admin |

Removing listings, Trusted Lender and roles stay in the UI on purpose.

## Testing

`pnpm test` runs **42 tests** with [convex-test](https://docs.convex.dev/testing/convex-test),
executing the real functions as different users (Alice lends, Bob borrows, Carol is a stranger,
plus an admin).

- **RBAC** ([`convex/rbac.test.ts`](convex/rbac.test.ts)): sign-in required; owner is the caller
  (a smuggled `ownerId` is rejected); no editing or deleting others' listings; public list is
  name + category only; no borrowing your own tool; server-side date rules; only owners
  approve/decline/return; only borrowers cancel; strangers get "not found"; overlapping approvals
  blocked; no emails in loan views; every admin function refuses non-admins; roles change only via
  internal `setRole`; icon validation.
- **Integration** ([`convex/automation.test.ts`](convex/automation.test.ts)): signing (tampered
  body, other path, wrong secret, stale timestamp rejected); 401 for unsigned calls; overdue feed
  data minimisation; **idempotent replay** of write-backs; outbox delivery is signed and minimal;
  **5 attempts with backoff then a visible failure**; activity hides error details from loan
  parties; automation log status codes, admin-only access, search and **30-day pruning**;
  delivery timeout and **stuck-delivery sweep**; write-back keys bound to their loan; stale
  requests expire; unknown log filters rejected; **borrow requests rate limited**.
- **MCP** ([`convex/mcp.test.ts`](convex/mcp.test.ts)): a Claude token acts as the same user as
  the browser; unknown users refused; Claude can't create users; can't act on someone else's loan;
  guardrails only accept MCP tokens; audit rows are per user; per-user rate limit.

---

## Design decisions and trade-offs

- **Why n8n at all?** For this app alone, Convex actions + a Convex cron could send the emails
  directly, with fewer moving parts. n8n earns its place when automations change often and
  non-engineers own them (copy changes, adding Slack or a CRM step without a deploy). So business
  rules and data stay in Convex, and n8n is a replaceable executor behind a signed, idempotent
  contract.
- **Push and pull.** Loan events are pushed by Convex (webhook); reminders are pulled by n8n on
  its own schedule. If n8n is down at 09:00 it doesn't catch up; running WF2 hourly is safe
  because of the per-day idempotency key (see PRODUCTION.md).
- **Cursor pagination.** Convex paginates by cursor, so tables number the pages you've reached
  (Previous · 1 2 3 · Next) with no total count or jump-to-page. Grids use infinite scroll.
- **Search.** Convex full-text search, relevance-ordered only (sort shows "Best match" while
  searching). Loan search matches tool name and first names, snapshotted when the request is
  made; renaming a tool later doesn't change old loans' search text.
- **Counts.** Convex has no count operator. Admin activity counts are capped index reads (99+);
  at scale, `@convex-dev/aggregate` counters.
- **"Today" is UTC** on both sides (Convex dates, n8n schedule). Per-user timezones are a
  production follow-up.
- **Unanswered requests expire.** A request still pending on its start date can't be approved
  any more, so a daily cron closes it as declined (no email: the lender didn't decline it).
- **Soft deletes** for all listing removals keep loan history intact; admin removal also declines
  pending requests (and notifies borrowers).
- **Mailpit, not a real provider**, so reviewers see every email locally with zero setup. Swapping
  in a provider is one SMTP credential change.
- **Cloudflare quick tunnel** needs no account but changes URL per start; `pnpm tunnel` re-points
  Convex automatically. Production uses a fixed HTTPS domain.
- **Overdue loans can't be created from the UI** (start dates can't be in the past), hence the
  internal `devSeed:overdueLoan` for testing.

## Project structure

```
app/                     Next.js routes: / (public), (signed-in)/tools, my/*, admin, connect;
                         /mcp + .well-known OAuth metadata
components/              UI (shadcn/ui primitives in components/ui)
hooks/ lib/              URL state, pagination, labels, list config
lib/mcp/                 MCP tools; Convex client acting as the signed-in user
convex/
  schema.ts              tables + indexes
  lib/auth.ts            RBAC helpers
  lib/hmac.ts            HMAC sign / verify
  lib/outbox.ts          enqueue in the same transaction
  tools.ts loans.ts users.ts admin.ts
  outbox.ts              delivery to n8n with retries
  http.ts                signed /n8n/* endpoints
  automation.ts          idempotent write-backs, overdue feed, HTTP log
  crons.ts               retention, stale requests, outbox sweep
  mcp.ts                 MCP rate limit + audit log
  *.test.ts              RBAC + integration tests
n8n/                     exported workflows (WF1–WF3), no secrets
scripts/                 n8n:setup, mcp:setup, tunnel
docker-compose.yml       n8n + Mailpit
```

## Built with AI assistance

The posting allows LLMs for writing code. I built LendLoop with Claude as a pair programmer:
design decisions, reviews, tests and every commit went through me.
