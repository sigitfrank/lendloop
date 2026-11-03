/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
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
    expect(await verify(SECRET, { ...p, path: "/n8n/automation-error" }, signature, now())).toBe(false);
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
