/// <reference types="vite/client" />
import rateLimiter from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { toIsoDate } from "./lib/dates";
import schema from "./schema";

// RBAC is enforced in Convex functions, not just hidden in the UI. These tests
// call the real functions as different users and assert who is refused.

const modules = import.meta.glob("./**/*.ts");
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => toIsoDate(Date.now() + n * DAY);
const today = inDays(0);
const page = { numItems: 20, cursor: null };

const NOT_ALLOWED = /permission/i;
const NOT_FOUND = /doesn't exist/i;

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const people = ["alice", "bob", "carol", "admin"] as const;
  await t.run(async (ctx) => {
    for (const who of people) {
      await ctx.db.insert("users", {
        tokenIdentifier: `test|${who}`,
        name: `${who[0].toUpperCase()}${who.slice(1)} Example`,
        email: `${who}@example.com`,
        role: who === "admin" ? "admin" : "user",
        trustedLender: false,
      });
    }
  });
  const as = (who: (typeof people)[number]) =>
    t.withIdentity({ tokenIdentifier: `test|${who}`, subject: who, issuer: "test" });

  const alice = as("alice");
  const toolId = await alice.mutation(api.tools.create, {
    name: "Cordless drill",
    category: "power_tools",
    condition: "good",
    description: "18V, two batteries",
  });

  return { t, alice, bob: as("bob"), carol: as("carol"), admin: as("admin"), toolId };
}

/** Bob asks to borrow Alice's drill. */
async function bobRequests(
  bob: Awaited<ReturnType<typeof setup>>["bob"],
  toolId: Id<"tools">,
  start = 2,
  end = 4,
) {
  return await bob.mutation(api.loans.request, {
    toolId,
    startDate: inDays(start),
    endDate: inDays(end),
  });
}

describe("tools", () => {
  test("signed-out callers can't create listings", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(api.tools.create, {
        name: "Ladder",
        category: "other",
        condition: "fair",
        description: "",
      }),
    ).rejects.toThrowError(/sign in/i);
  });

  test("the owner is always the caller; a client-supplied ownerId is rejected", async () => {
    const { bob } = await setup();
    await expect(
      bob.mutation(api.tools.create, {
        name: "Tent",
        category: "camping",
        condition: "good",
        description: "",
        // @ts-expect-error not part of the function's arguments
        ownerId: "someone-else",
      }),
    ).rejects.toThrowError();
  });

  test("users can't edit or delete someone else's listing", async () => {
    const { bob, toolId } = await setup();
    await expect(
      bob.mutation(api.tools.update, {
        toolId,
        name: "Mine now",
        category: "power_tools",
        condition: "good",
        description: "",
      }),
    ).rejects.toThrowError(NOT_ALLOWED);
    await expect(bob.mutation(api.tools.remove, { toolId })).rejects.toThrowError(NOT_ALLOWED);
  });

  test("the public list exposes only name and category", async () => {
    const { t } = await setup();
    const tools = await t.query(api.tools.listPublic, {});
    expect(tools).toHaveLength(1);
    expect(Object.keys(tools[0]).sort()).toEqual(["_id", "category", "name"]);
  });
});

describe("loans", () => {
  test("owners can't borrow their own tool", async () => {
    const { alice, toolId } = await setup();
    await expect(
      alice.mutation(api.loans.request, { toolId, startDate: inDays(1), endDate: inDays(2) }),
    ).rejects.toThrowError(/your own tool/i);
  });

  test("date rules are enforced server-side", async () => {
    const { bob, toolId } = await setup();
    await expect(bobRequests(bob, toolId, -1, 2)).rejects.toThrowError(/past/i);
    await expect(bobRequests(bob, toolId, 3, 2)).rejects.toThrowError(/before the start/i);
    await expect(bobRequests(bob, toolId, 1, 40)).rejects.toThrowError(/at most 30 days/i);
  });

  test("only the tool owner can approve, decline or mark returned", async () => {
    const { alice, bob, toolId } = await setup();
    const loanId = await bobRequests(bob, toolId);

    await expect(
      bob.mutation(api.loans.respond, { loanId, decision: "approve" }),
    ).rejects.toThrowError(NOT_ALLOWED);

    await alice.mutation(api.loans.respond, { loanId, decision: "approve" });
    await expect(bob.mutation(api.loans.markReturned, { loanId })).rejects.toThrowError(
      NOT_ALLOWED,
    );
    await alice.mutation(api.loans.markReturned, { loanId });
  });

  test("only the borrower can cancel, and only while pending", async () => {
    const { alice, bob, toolId } = await setup();
    const loanId = await bobRequests(bob, toolId);

    await expect(alice.mutation(api.loans.cancel, { loanId })).rejects.toThrowError(NOT_ALLOWED);
    await bob.mutation(api.loans.cancel, { loanId });
    await expect(bob.mutation(api.loans.cancel, { loanId })).rejects.toThrowError(
      /already been handled/i,
    );
  });

  test("a stranger can't act on, or even confirm, someone else's loan", async () => {
    const { bob, carol, toolId } = await setup();
    const loanId = await bobRequests(bob, toolId);

    await expect(
      carol.mutation(api.loans.respond, { loanId, decision: "approve" }),
    ).rejects.toThrowError(NOT_FOUND);
    await expect(carol.mutation(api.loans.cancel, { loanId })).rejects.toThrowError(NOT_FOUND);

    const view = { paginationOpts: page, today };
    expect((await carol.query(api.loans.mine, view)).page).toHaveLength(0);
    expect((await carol.query(api.loans.incoming, view)).page).toHaveLength(0);
  });

  test("two overlapping requests can't both be approved", async () => {
    const { alice, bob, carol, toolId } = await setup();
    const first = await bobRequests(bob, toolId, 2, 5);
    const second = await carol.mutation(api.loans.request, {
      toolId,
      startDate: inDays(4),
      endDate: inDays(6),
    });

    await alice.mutation(api.loans.respond, { loanId: first, decision: "approve" });
    await expect(
      alice.mutation(api.loans.respond, { loanId: second, decision: "approve" }),
    ).rejects.toThrowError(/overlap/i);
  });

  test("loan views never include email addresses", async () => {
    const { alice, bob, toolId } = await setup();
    await bobRequests(bob, toolId);
    const incoming = await alice.query(api.loans.incoming, { paginationOpts: page, today });
    expect(incoming.page).toHaveLength(1);
    expect(JSON.stringify(incoming.page)).not.toContain("@");
  });
});

describe("admin", () => {
  test("non-admins are refused by every admin function", async () => {
    const { bob, toolId } = await setup();
    const bobId = (await bob.query(api.users.current, {}))!._id;

    await expect(bob.query(api.admin.loans, { paginationOpts: page, today })).rejects.toThrowError(
      NOT_ALLOWED,
    );
    await expect(bob.query(api.admin.users, { paginationOpts: page })).rejects.toThrowError(
      NOT_ALLOWED,
    );
    await expect(bob.mutation(api.admin.removeTool, { toolId })).rejects.toThrowError(NOT_ALLOWED);
    await expect(
      bob.mutation(api.admin.setTrustedLender, { userId: bobId, trusted: true }),
    ).rejects.toThrowError(NOT_ALLOWED);
  });

  test("admins can remove any listing; pending requests on it are declined", async () => {
    const { t, admin, bob, toolId } = await setup();
    const loanId = await bobRequests(bob, toolId);

    await admin.mutation(api.admin.removeTool, { toolId });

    const { tool, loan } = await t.run(async (ctx) => ({
      tool: await ctx.db.get(toolId),
      loan: await ctx.db.get(loanId),
    }));
    expect(tool?.removedBy).toBe("admin");
    expect(loan?.status).toBe("declined");
    expect(await t.query(api.tools.listPublic, {})).toHaveLength(0);
  });

  test("admins can mark a Trusted Lender", async () => {
    const { admin, alice } = await setup();
    const aliceId = (await alice.query(api.users.current, {}))!._id;
    await admin.mutation(api.admin.setTrustedLender, { userId: aliceId, trusted: true });
    expect((await alice.query(api.users.current, {}))?.trustedLender).toBe(true);
  });

  test("roles change only through the internal setRole (CLI), and new users are 'user'", async () => {
    const { t, carol } = await setup();
    const fresh = t.withIdentity({
      tokenIdentifier: "test|dave",
      subject: "dave",
      issuer: "test",
      email: "dave@example.com",
    });
    await fresh.mutation(api.users.store, {});
    expect((await fresh.query(api.users.current, {}))?.role).toBe("user");

    await t.mutation(internal.users.setRole, { email: "carol@example.com", role: "admin" });
    expect((await carol.query(api.users.current, {}))?.role).toBe("admin");
  });
});

describe("tool icons", () => {
  test("an icon can be set, cleared on edit, and must come from the allowed set", async () => {
    const { t, alice, toolId } = await setup();
    const fields = {
      name: "Cordless drill",
      category: "power_tools" as const,
      condition: "good" as const,
      description: "",
    };

    await alice.mutation(api.tools.update, { toolId, ...fields, icon: "drill" });
    expect((await t.run((ctx) => ctx.db.get(toolId)))?.icon).toBe("drill");

    await alice.mutation(api.tools.update, { toolId, ...fields }); // "Auto" / cleared
    expect((await t.run((ctx) => ctx.db.get(toolId)))?.icon).toBeUndefined();

    await expect(
      // @ts-expect-error not one of TOOL_ICONS
      alice.mutation(api.tools.update, { toolId, ...fields, icon: "rocket" }),
    ).rejects.toThrowError();
  });
});
