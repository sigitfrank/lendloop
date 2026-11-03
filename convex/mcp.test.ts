/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { toIsoDate } from "./lib/dates";
import { MCP_TOKEN_ISSUER } from "./lib/mcp";
import schema from "./schema";

// Claude (MCP) calls Convex with a short-lived token from our own issuer.
// These tests check it maps to the same user as the browser session, gets the
// same permissions (no more), and goes through the MCP guardrails.

const modules = import.meta.glob("./**/*.ts");
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => toIsoDate(Date.now() + n * DAY);
const page = { numItems: 20, cursor: null };

beforeAll(() => {
  // Browser sessions are `${clerkIssuer}|${subject}`; MCP tokens map onto that.
  process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test/";
});

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  await t.run(async (ctx) => {
    for (const who of ["alice", "bob", "carol"]) {
      await ctx.db.insert("users", {
        tokenIdentifier: `https://clerk.example.test|${who}`,
        name: `${who[0].toUpperCase()}${who.slice(1)} Example`,
        role: "user",
        trustedLender: false,
      });
    }
  });
  const browser = (who: string) =>
    t.withIdentity({
      tokenIdentifier: `https://clerk.example.test|${who}`,
      subject: who,
      issuer: "https://clerk.example.test",
    });
  const claude = (who: string) =>
    t.withIdentity({
      tokenIdentifier: `${MCP_TOKEN_ISSUER}|${who}`,
      subject: who,
      issuer: MCP_TOKEN_ISSUER,
    });
  return { t, browser, claude };
}

describe("MCP identity", () => {
  test("a Claude token acts as the same user as the browser session", async () => {
    const { browser, claude } = await setup();
    const toolId = await claude("alice").mutation(api.tools.create, {
      name: "Ladder",
      category: "other",
      condition: "good",
      description: "3 m",
    });
    const mine = await browser("alice").query(api.tools.mine, {
      paginationOpts: page,
      today: inDays(0),
    });
    expect(mine.page.map((tool) => tool._id)).toEqual([toolId]);
  });

  test("a Claude token for an unknown user is refused", async () => {
    const { claude } = await setup();
    await expect(
      claude("mallory").query(api.tools.mine, { paginationOpts: page, today: inDays(0) }),
    ).rejects.toThrow();
  });

  test("a Claude token can't create a user row", async () => {
    const { t, claude } = await setup();
    await expect(claude("mallory").mutation(api.users.store, {})).rejects.toThrow(/browser/);
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(3);
  });

  test("Claude can't act on someone else's loan", async () => {
    const { claude } = await setup();
    const toolId = await claude("alice").mutation(api.tools.create, {
      name: "Drill",
      category: "power_tools",
      condition: "good",
      description: "",
    });
    const loanId = await claude("bob").mutation(api.loans.request, {
      toolId,
      startDate: inDays(1),
      endDate: inDays(2),
    });
    // Carol is neither lender nor borrower; Bob is not the lender.
    await expect(
      claude("carol").mutation(api.loans.respond, { loanId, decision: "approve" }),
    ).rejects.toThrow();
    await expect(
      claude("bob").mutation(api.loans.respond, { loanId, decision: "approve" }),
    ).rejects.toThrow(/permission/i);
    await claude("alice").mutation(api.loans.respond, { loanId, decision: "approve" });
  });
});

describe("MCP guardrails", () => {
  test("startCall only accepts MCP tokens", async () => {
    const { browser } = await setup();
    await expect(
      browser("alice").mutation(api.mcp.startCall, { tool: "search_tools" }),
    ).rejects.toThrow(/MCP clients/);
  });

  test("calls are audited for the caller only", async () => {
    const { browser, claude } = await setup();
    const callId = await claude("alice").mutation(api.mcp.startCall, { tool: "search_tools" });
    await claude("alice").mutation(api.mcp.finishCall, { callId, ok: true, durationMs: 12 });
    await expect(
      claude("bob").mutation(api.mcp.finishCall, { callId, ok: false, durationMs: 1 }),
    ).rejects.toThrow(/Unknown call/);

    const calls = await browser("alice").query(api.mcp.myRecentCalls, {});
    expect(calls).toMatchObject([{ tool: "search_tools", status: "ok" }]);
    expect(await browser("bob").query(api.mcp.myRecentCalls, {})).toEqual([]);
  });

  test("tool calls are rate limited per user", async () => {
    const { claude } = await setup();
    // Burst capacity is 20; the 21st call in the same instant is refused.
    for (let i = 0; i < 20; i++) {
      await claude("alice").mutation(api.mcp.startCall, { tool: "search_tools" });
    }
    await expect(
      claude("alice").mutation(api.mcp.startCall, { tool: "search_tools" }),
    ).rejects.toThrow(/Too many requests/);
    // Other users have their own bucket.
    await claude("bob").mutation(api.mcp.startCall, { tool: "search_tools" });
  });
});
