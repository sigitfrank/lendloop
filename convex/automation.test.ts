/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { toIsoDate } from "./lib/dates";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, sign, verify } from "./lib/hmac";
import { notificationKey, overdueReminderKey } from "./lib/keys";
import schema from "./schema";

// Integration reliability: HMAC signing, signed endpoints, idempotent
// write-backs and outbox retries.

const modules = import.meta.glob("./**/*.ts");
const SECRET = "test-secret-not-real";
const DAY = 24 * 60 * 60 * 1000;
const now = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  process.env.LENDLOOP_HMAC_SECRET = SECRET;
  process.env.N8N_WEBHOOK_URL = "https://n8n.example.test/webhook/lendloop";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Headers n8n would send for this request. */
async function signedHeaders(method: string, path: string, body = "", secret = SECRET) {
  const timestamp = String(now());
  const signature = await sign(secret, { timestamp, method, path, body });
  return { [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: signature };
}

/** Alice lends a drill, Bob borrows it; the loan ended two days ago (overdue). */
async function setupOverdueLoan() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const loanId = await t.run(async (ctx) => {
    const alice = await ctx.db.insert("users", {
      tokenIdentifier: "test|alice",
      name: "Alice Lender",
      email: "alice@example.com",
      role: "user",
      trustedLender: false,
    });
    const bob = await ctx.db.insert("users", {
      tokenIdentifier: "test|bob",
      name: "Bob Borrower",
      email: "bob@example.com",
      role: "user",
      trustedLender: false,
    });
    const toolId = await ctx.db.insert("tools", {
      ownerId: alice,
      name: "Drill",
      nameLower: "drill",
      category: "power_tools",
      condition: "good",
      description: "Secret description that must never leave Convex",
    });
    return await ctx.db.insert("loans", {
      toolId,
      ownerId: alice,
      borrowerId: bob,
      startDate: toIsoDate(Date.now() - 6 * DAY),
      endDate: toIsoDate(Date.now() - 2 * DAY),
      status: "approved",
      searchText: "Drill Alice Bob",
    });
  });
  return { t, loanId };
}

describe("HMAC signing", () => {
  const parts = { timestamp: "", method: "POST", path: "/n8n/reminder-status", body: '{"a":1}' };

  test("a correct signature verifies", async () => {
    const p = { ...parts, timestamp: String(now()) };
    expect(await verify(SECRET, p, await sign(SECRET, p), now())).toBe(true);
  });

  test("tampered body, other path, wrong secret or stale timestamp are rejected", async () => {
    const p = { ...parts, timestamp: String(now()) };
    const signature = await sign(SECRET, p);
    expect(await verify(SECRET, { ...p, body: '{"a":2}' }, signature, now())).toBe(false);
    expect(await verify(SECRET, { ...p, path: "/n8n/automation-error" }, signature, now())).toBe(
      false,
    );
    expect(await verify("other-secret", p, signature, now())).toBe(false);
    expect(await verify(SECRET, p, signature, now() + 6 * 60)).toBe(false); // > 5 min later
    expect(await verify(SECRET, p, "not-hex", now())).toBe(false);
  });
});

describe("signed n8n endpoints", () => {
  test("unsigned or wrongly signed requests get 401", async () => {
    const { t } = await setupOverdueLoan();
    expect((await t.fetch("/n8n/overdue-loans")).status).toBe(401);
    const forged = await signedHeaders("GET", "/n8n/overdue-loans", "", "guessed-secret");
    expect((await t.fetch("/n8n/overdue-loans", { headers: forged })).status).toBe(401);
  });

  test("the overdue feed returns only what a reminder needs", async () => {
    const { t, loanId } = await setupOverdueLoan();
    const res = await t.fetch("/n8n/overdue-loans", {
      headers: await signedHeaders("GET", "/n8n/overdue-loans"),
    });
    expect(res.status).toBe(200);
    const { today, loans } = await res.json();
    expect(loans).toEqual([
      {
        loanId,
        idempotencyKey: overdueReminderKey(loanId, today),
        toolName: "Drill",
        endDate: expect.any(String),
        borrower: { firstName: "Bob", email: "bob@example.com" },
      },
    ]);
    const raw = JSON.stringify(loans);
    expect(raw).not.toContain("alice@example.com"); // the lender's email is not needed
    expect(raw).not.toContain("Secret description");
  });

  test("replaying the same reminder write-back is idempotent; reminded loans drop out", async () => {
    const { t, loanId } = await setupOverdueLoan();
    const key = overdueReminderKey(loanId, toIsoDate(Date.now()));
    const body = JSON.stringify({ idempotencyKey: key, loanId, status: "sent" });
    const post = async () =>
      t.fetch("/n8n/reminder-status", {
        method: "POST",
        headers: await signedHeaders("POST", "/n8n/reminder-status", body),
        body,
      });

    expect(await (await post()).json()).toEqual({ ok: true, duplicate: false });
    expect(await (await post()).json()).toEqual({ ok: true, duplicate: true });

    const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "overdue_reminder", status: "sent", loanId });

    const feed = await t.fetch("/n8n/overdue-loans", {
      headers: await signedHeaders("GET", "/n8n/overdue-loans"),
    });
    expect((await feed.json()).loans).toEqual([]); // no second reminder today
  });

  test("bad write-back input is a 400, not a crash", async () => {
    const { t } = await setupOverdueLoan();
    const body = JSON.stringify({ idempotencyKey: "overdue:x:y", loanId: "nope", status: "maybe" });
    const res = await t.fetch("/n8n/reminder-status", {
      method: "POST",
      headers: await signedHeaders("POST", "/n8n/reminder-status", body),
      body,
    });
    expect(res.status).toBe(400);
  });

  test("n8n errors are recorded once per execution", async () => {
    const { t } = await setupOverdueLoan();
    const body = JSON.stringify({ executionId: "123", workflow: "WF2", message: "SMTP down" });
    for (let i = 0; i < 2; i++) {
      await t.fetch("/n8n/automation-error", {
        method: "POST",
        headers: await signedHeaders("POST", "/n8n/automation-error", body),
        body,
      });
    }
    const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", status: "failed", detail: "WF2: SMTP down" });
  });
});

describe("outbox delivery to n8n", () => {
  async function requestLoan() {
    const { t } = await setupOverdueLoan();
    const bob = t.withIdentity({ tokenIdentifier: "test|bob", subject: "bob", issuer: "test" });
    const toolId = await t.run(async (ctx) => (await ctx.db.query("tools").first())!._id);
    const loanId: Id<"loans"> = await bob.mutation(api.loans.request, {
      toolId,
      startDate: toIsoDate(Date.now() + 3 * DAY),
      endDate: toIsoDate(Date.now() + 5 * DAY),
    });
    return { t, loanId };
  }

  test("a new request is delivered once, signed, with a minimal payload", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, loanId } = await requestLoan();

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers[SIGNATURE_HEADER]).toMatch(/^[0-9a-f]{64}$/);
    const payload = JSON.parse(init.body as string);
    expect(payload).toMatchObject({
      idempotencyKey: notificationKey(loanId, "pending"),
      event: "loan.created",
      recipient: { role: "lender", firstName: "Alice", email: "alice@example.com" },
      otherPartyFirstName: "Bob",
    });
    expect(init.body).not.toContain("bob@example.com"); // only the recipient's email
    expect(init.body).not.toContain("Secret description");

    const [row] = await t.run((ctx) => ctx.db.query("outbox").collect());
    expect(row).toMatchObject({ status: "delivered", attempts: 0 });
  });

  test("when n8n keeps failing, it retries with backoff, then fails visibly", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, loanId } = await requestLoan();

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const [row] = await t.run((ctx) => ctx.db.query("outbox").collect());
    expect(row).toMatchObject({ status: "failed", attempts: 5, lastError: "n8n responded 503" });
    const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events).toEqual([
      expect.objectContaining({
        loanId,
        type: "request_notification",
        status: "failed",
        idempotencyKey: notificationKey(loanId, "pending"),
      }),
    ]);
  });
});

describe("automation activity on loans (bonus)", () => {
  test("parties see retrying → failed in plain status; only admins see the error detail", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    const { t } = await setupOverdueLoan();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        tokenIdentifier: "test|admin",
        name: "Ada Admin",
        email: "admin@example.com",
        role: "admin",
        trustedLender: false,
      });
    });
    const as = (who: string) =>
      t.withIdentity({ tokenIdentifier: `test|${who}`, subject: who, issuer: "test" });
    const toolId = await t.run(async (ctx) => (await ctx.db.query("tools").first())!._id);
    await as("bob").mutation(api.loans.request, {
      toolId,
      startDate: toIsoDate(Date.now() + 3 * DAY),
      endDate: toIsoDate(Date.now() + 5 * DAY),
    });
    const view = {
      paginationOpts: { numItems: 10, cursor: null },
      filter: "pending" as const,
      today: toIsoDate(Date.now()),
    };

    // First delivery attempt fails → the lender sees a retry, without internals.
    vi.runOnlyPendingTimers();
    await t.finishInProgressScheduledFunctions();
    let [loan] = (await as("alice").query(api.loans.incoming, view)).page;
    expect(loan.activity[0]).toMatchObject({
      kind: "retrying",
      status: "retrying",
      about: "pending",
      attempt: 2,
    });
    expect(loan.activity[0].detail).toBeUndefined();

    // All retries exhausted → "failed"; still no detail for the parties.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    [loan] = (await as("alice").query(api.loans.incoming, view)).page;
    expect(loan.activity).toEqual([
      expect.objectContaining({ kind: "notification", status: "failed", about: "pending" }),
    ]);
    expect(loan.activity[0].detail).toBeUndefined();
    const [borrowerView] = (await as("bob").query(api.loans.mine, view)).page;
    expect(borrowerView.activity[0].detail).toBeUndefined();

    // Admins see why, in the loan view and in the automation log.
    const [adminView] = (await as("admin").query(api.admin.loans, view)).page;
    expect(adminView.activity[0].detail).toContain("n8n responded 503");
    const log = (filter: string) =>
      as("admin").query(api.admin.automationLog, {
        paginationOpts: { numItems: 20, cursor: null },
        filter,
      });
    const failed = (await log("failed")).page;
    expect(failed).toHaveLength(5); // one row per delivery attempt
    expect(failed[0]).toMatchObject({
      direction: "to_n8n",
      statusCode: 503,
      ok: false,
      toolName: "Drill",
      detail: "n8n responded 503",
    });
    expect((await log("503")).page).toHaveLength(5);
    expect((await log("200")).page).toHaveLength(0);
  });
});

describe("automation log", () => {
  test("logs n8n → Convex calls with their status, and is admin-only", async () => {
    const { t, loanId } = await setupOverdueLoan();
    await t.fetch("/n8n/overdue-loans"); // unsigned → 401, not logged (no DB write)
    const body = JSON.stringify({ idempotencyKey: `overdue:${loanId}:x`, loanId, status: "sent" });
    await t.fetch("/n8n/reminder-status", {
      method: "POST",
      headers: await signedHeaders("POST", "/n8n/reminder-status", body),
      body,
    }); // signed → 200
    await t.fetch("/n8n/reminder-status", {
      method: "POST",
      headers: await signedHeaders("POST", "/n8n/reminder-status", "{}"),
      body: "{}",
    }); // signed but invalid → 400

    const rows = await t.run((ctx) => ctx.db.query("automationLog").order("desc").collect());
    expect(rows.map((r) => [r.direction, r.path, r.statusCode])).toEqual([
      ["from_n8n", "/n8n/reminder-status", 400],
      ["from_n8n", "/n8n/reminder-status", 200],
    ]);
    expect(rows[0].detail).toBeTruthy();

    const bob = t.withIdentity({ tokenIdentifier: "test|bob", subject: "bob", issuer: "test" });
    await expect(
      bob.query(api.admin.automationLog, { paginationOpts: { numItems: 5, cursor: null } }),
    ).rejects.toThrowError(/permission/i);
  });

  test("rows older than 30 days are pruned", async () => {
    vi.useFakeTimers();
    const { t } = await setupOverdueLoan();
    const row = {
      direction: "from_n8n" as const,
      method: "GET",
      path: "/n8n/overdue-loans",
      statusCode: 200,
      ok: true,
    };
    await t.run((ctx) => ctx.db.insert("automationLog", row)); // will be 31 days old
    vi.advanceTimersByTime(31 * DAY);
    await t.run((ctx) => ctx.db.insert("automationLog", row)); // fresh

    expect(await t.mutation(internal.automation.pruneLog, {})).toEqual({ deleted: 1 });
    expect(await t.run((ctx) => ctx.db.query("automationLog").collect())).toHaveLength(1);
  });
});

test("an n8n workflow error stays visible in the log with its message", async () => {
  const { t } = await setupOverdueLoan();
  await t.run((ctx) =>
    ctx.db.insert("users", {
      tokenIdentifier: "test|admin",
      name: "Ada Admin",
      email: "admin@example.com",
      role: "admin",
      trustedLender: false,
    }),
  );
  const body = JSON.stringify({
    executionId: "777",
    workflow: "LendLoop · Overdue reminders",
    node: "Send reminder (Mailpit)",
    message: "SMTP connection refused",
  });
  await t.fetch("/n8n/automation-error", {
    method: "POST",
    headers: await signedHeaders("POST", "/n8n/automation-error", body),
    body,
  });

  const admin = t.withIdentity({ tokenIdentifier: "test|admin", subject: "admin", issuer: "test" });
  const { page } = await admin.query(api.admin.automationLog, {
    paginationOpts: { numItems: 10, cursor: null },
    filter: "workflow-errors",
  });
  expect(page).toEqual([
    expect.objectContaining({
      statusCode: 200, // the report was accepted…
      isWorkflowError: true, // …but it describes a failure, so it's flagged
      detail: "LendLoop · Overdue reminders › Send reminder (Mailpit): SMTP connection refused",
    }),
  ]);
});

test("the automation log is searchable, combined with the status filter", async () => {
  const { t, loanId } = await setupOverdueLoan();
  await t.run((ctx) =>
    ctx.db.insert("users", {
      tokenIdentifier: "test|admin",
      name: "Ada Admin",
      email: "admin@example.com",
      role: "admin",
      trustedLender: false,
    }),
  );
  const log = (args: Record<string, unknown>) =>
    t.mutation(internal.automation.logRequest, {
      direction: "to_n8n",
      method: "POST",
      path: "/webhook/lendloop-loan-events",
      ...args,
    } as never);
  await log({ statusCode: 503, loanId, detail: "n8n responded 503" });
  await log({ statusCode: 202, loanId });

  const admin = t.withIdentity({ tokenIdentifier: "test|admin", subject: "admin", issuer: "test" });
  const find = (search: string, filter = "all") =>
    admin.query(api.admin.automationLog, {
      paginationOpts: { numItems: 10, cursor: null },
      search,
      filter,
    });

  expect((await find("Drill")).page).toHaveLength(2); // tool name of the linked loan
  expect((await find("responded")).page).toEqual([expect.objectContaining({ statusCode: 503 })]);
  expect((await find("Drill", "failed")).page).toEqual([
    expect.objectContaining({ statusCode: 503 }),
  ]);
  expect((await find("Drill", "202")).page).toEqual([expect.objectContaining({ statusCode: 202 })]);
});

describe("review fixes", () => {
  test("delivery has a timeout, and a delivery that never finished is re-queued", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, loanId } = await setupOverdueLoan();
    const outboxId = await t.run((ctx) =>
      ctx.db.insert("outbox", {
        loanId,
        event: "approved",
        idempotencyKey: notificationKey(loanId, "approved"),
        status: "pending",
        attempts: 0,
        nextAttemptAt: Date.now() - 60 * 60_000, // due an hour ago, nothing recorded
      }),
    );

    expect(await t.mutation(internal.outbox.sweepStuck, {})).toEqual({ swept: 1 });
    const swept = await t.run((ctx) => ctx.db.get("outbox", outboxId));
    expect(swept).toMatchObject({ status: "pending", attempts: 1 });
    expect(swept!.nextAttemptAt).toBeGreaterThan(Date.now());

    await t.finishAllScheduledFunctions(vi.runAllTimers); // the re-queued retry runs
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(await t.run((ctx) => ctx.db.get("outbox", outboxId))).toMatchObject({
      status: "delivered",
    });
  });

  test("a write-back key must belong to the loan it names", async () => {
    const { t, loanId } = await setupOverdueLoan();
    const otherKey = overdueReminderKey("someOtherLoanId", toIsoDate(Date.now()));
    const body = JSON.stringify({ idempotencyKey: otherKey, loanId, status: "sent" });
    const response = await t.fetch("/n8n/reminder-status", {
      method: "POST",
      headers: await signedHeaders("POST", "/n8n/reminder-status", body),
      body,
    });
    expect(response.status).toBe(400);
  });

  test("pending requests past their start date expire as declined", async () => {
    const { t } = await setupOverdueLoan();
    const ids = await t.run(async (ctx) => {
      const loan = (await ctx.db.query("loans").first())!;
      const make = (startInDays: number) =>
        ctx.db.insert("loans", {
          ...loan,
          _id: undefined,
          _creationTime: undefined,
          status: "pending",
          startDate: toIsoDate(Date.now() + startInDays * DAY),
          endDate: toIsoDate(Date.now() + (startInDays + 1) * DAY),
        } as never);
      return { stale: await make(-1), current: await make(0), future: await make(2) };
    });

    expect(await t.mutation(internal.loans.expireStaleRequests, {})).toEqual({ expired: 1 });
    const status = (id: Id<"loans">) =>
      t.run(async (ctx) => (await ctx.db.get("loans", id))!.status);
    expect(await status(ids.stale)).toBe("declined");
    expect(await status(ids.current)).toBe("pending"); // starts today: can still be approved
    expect(await status(ids.future)).toBe("pending");
  });

  test("the automation log rejects unknown filters", async () => {
    const { t } = await setupOverdueLoan();
    await t.run((ctx) =>
      ctx.db.insert("users", {
        tokenIdentifier: "test|admin",
        name: "Ada Admin",
        role: "admin",
        trustedLender: false,
      }),
    );
    const admin = t.withIdentity({
      tokenIdentifier: "test|admin",
      subject: "admin",
      issuer: "test",
    });
    await expect(
      admin.query(api.admin.automationLog, {
        paginationOpts: { numItems: 10, cursor: null },
        filter: "everything",
      }),
    ).rejects.toThrow(/Unknown filter/);
  });

  test("borrow requests are rate limited per user", async () => {
    const { t } = await setupOverdueLoan();
    const bob = t.withIdentity({ tokenIdentifier: "test|bob", subject: "bob", issuer: "test" });
    const toolId = await t.run(async (ctx) => (await ctx.db.query("tools").first())!._id);
    const range = {
      startDate: toIsoDate(Date.now() + 3 * DAY),
      endDate: toIsoDate(Date.now() + 4 * DAY),
    };
    // A request/cancel loop would email the lender each time; burst capacity is 10.
    for (let i = 0; i < 10; i++) {
      const loanId = await bob.mutation(api.loans.request, { toolId, ...range });
      await bob.mutation(api.loans.cancel, { loanId });
    }
    await expect(bob.mutation(api.loans.request, { toolId, ...range })).rejects.toThrow(
      /Too many requests/,
    );
  });
});
