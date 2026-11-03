import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { toIsoDate } from "./lib/dates";
import { loanSearchText } from "./lib/search";

// Development helpers. Internal: only runnable from the CLI or dashboard with
// deployment access, never from the browser.

const DAY = 24 * 60 * 60 * 1000;

/**
 * Creates an approved loan whose end date has passed, so the daily overdue
 * reminder (n8n WF2) has something to send. The UI can't do this on purpose:
 * it rejects start dates in the past.
 *   pnpm convex run devSeed:overdueLoan
 *   pnpm convex run devSeed:overdueLoan '{"daysOverdue": 5}'
 */
export const overdueLoan = internalMutation({
  args: { daysOverdue: v.optional(v.number()) },
  returns: v.object({
    loanId: v.id("loans"),
    tool: v.string(),
    lender: v.string(),
    borrower: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  }),
  handler: async (ctx, { daysOverdue = 2 }) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_removedAt", (q) => q.eq("removedAt", undefined))
      .take(50);
    const users = await ctx.db.query("users").take(50);

    for (const tool of tools) {
      const borrower = users.find((u) => u._id !== tool.ownerId && u.email);
      if (!borrower) continue;
      const lender = users.find((u) => u._id === tool.ownerId);

      const endDate = toIsoDate(Date.now() - daysOverdue * DAY);
      const startDate = toIsoDate(Date.now() - (daysOverdue + 3) * DAY);
      const loanId = await ctx.db.insert("loans", {
        toolId: tool._id,
        ownerId: tool.ownerId,
        borrowerId: borrower._id,
        startDate,
        endDate,
        status: "approved",
        decidedAt: Date.now(),
        searchText: loanSearchText(tool.name, lender?.name, borrower.name),
      });
      return {
        loanId,
        tool: tool.name,
        lender: lender?.name ?? "unknown",
        borrower: borrower.name,
        startDate,
        endDate,
      };
    }
    throw new ConvexError("Need at least one listed tool and a second user with an email.");
  },
});

// ── Demo data ──────────────────────────────────────────────────────────────

type ToolSeed = [
  name: string,
  category: Doc<"tools">["category"],
  description: string,
  icon?: Doc<"tools">["icon"],
];
type LoanPattern = { status: Doc<"loans">["status"]; start: number; days: number };

const LISTINGS = 20; // the lender lists the first 20

// Seeded listings. Name + description together mark a row as seeded.
const CATALOGUE: ToolSeed[] = [
  ["Cordless drill", "power_tools", "18V with two batteries and a bit set.", "drill"],
  ["Circular saw", "power_tools", "Blade is fine, guard a bit stiff."],
  ["Jigsaw", "power_tools", "Variable speed, three blades."],
  ["Orbital sander", "power_tools", "Dust bag and a pack of sanding pads."],
  ["Angle grinder", "power_tools", "115 mm, cutting and grinding discs."],
  ["Socket wrench set", "hand_tools", "Metric 8 to 24 mm.", "wrench"],
  ["Tile cutter", "hand_tools", "Manual, up to 60 cm tiles.", "ruler"],
  ["Paint roller kit", "hand_tools", "Two rollers, tray and pole.", "paint-roller"],
  ["Starter toolbox", "hand_tools", "Hammer, screwdrivers, pliers, tape.", "toolbox"],
  ["Spirit level 120 cm", "hand_tools", "Aluminium, three vials.", "ruler"],
  ["Petrol lawn mower", "garden", "Self-propelled, grass box included.", "tractor"],
  ["Hedge trimmer", "garden", "Cordless, 50 cm blade.", "sprout"],
  ["Wheelbarrow", "garden", "Sturdy, tyre needs air now and then.", "shovel"],
  ["Leaf blower", "garden", "Cordless, with a spare battery.", "tree"],
  ["Garden shears", "garden", "Long-handled, freshly sharpened.", "flower"],
  ["Stand mixer", "kitchen", "With dough hook and whisk.", "blender"],
  ["Pasta machine", "kitchen", "Hand-crank, three cutters.", "utensils"],
  ["Slow cooker 6 L", "kitchen", "Ceramic pot, dishwasher safe.", "cooking-pot"],
  ["Waffle maker", "kitchen", "Belgian style, non-stick plates.", "utensils"],
  ["4-person tent", "camping", "Easy pitch, rain fly included.", "tent"],
  ["Camping stove", "camping", "Two burners, gas not included.", "cooking-pot"],
  ["Hiking backpack 60 L", "camping", "Rain cover included.", "backpack"],
  ["Head torch", "camping", "Rechargeable, red light mode.", "flashlight"],
  ["Pressure washer", "cleaning", "1800 W, patio and car nozzles.", "spray-can"],
  ["Carpet cleaner", "cleaning", "Includes upholstery tool.", "washing-machine"],
  ["Mountain bike", "sports", "Medium frame, helmet on request.", "bike"],
  ["Dumbbell set", "sports", "Adjustable, 2 to 20 kg.", "dumbbell"],
  ["HD projector", "other", "HDMI cable and small screen included.", "projector"],
  ["Camera tripod", "other", "Up to 160 cm, phone mount too.", "camera"],
  ["Aluminium ladder 3 m", "other", "Folding, fits in a hatchback."],
];

const CONDITIONS: Doc<"tools">["condition"][] = ["new", "good", "good", "fair", "worn"];

// One per listing, cycled. Days are relative to today.
const LOAN_PATTERNS: LoanPattern[] = [
  { status: "pending", start: 3, days: 2 },
  { status: "approved", start: -2, days: 4 }, // on loan now
  { status: "returned", start: -20, days: 3 },
  { status: "approved", start: 8, days: 3 }, // upcoming
  { status: "declined", start: 5, days: 2 },
  { status: "pending", start: 10, days: 3 },
  { status: "approved", start: -9, days: 4 }, // overdue
  { status: "cancelled", start: 6, days: 2 },
  { status: "returned", start: -40, days: 5 },
  { status: "pending", start: 15, days: 2 },
];

/** Seeded listings are recognised by exact name + description (see clearDemo). */
const isSeededTool = (tool: Doc<"tools">) =>
  CATALOGUE.some(([name, , description]) => tool.name === name && tool.description === description);

/**
 * Demo data for the two real accounts:
 * - the non-admin account (the lender) gets 20 listings;
 * - the admin account (the borrower) asks to borrow each of them once, so the
 *   lender sees 20 incoming requests and the admin 20 in My requests, in every
 *   state (pending, on loan, upcoming, overdue, returned, declined, cancelled),
 *   with the automation history n8n would have written back.
 * Rows are inserted directly, so no emails are sent.
 *   pnpm convex run devSeed:demoData      (remove with devSeed:clearDemo)
 */
export const demoData = internalMutation({
  args: {},
  returns: v.object({ tools: v.number(), loans: v.number() }),
  handler: async (ctx) => {
    const users = (await ctx.db.query("users").take(200)).filter(
      (user) => !user.tokenIdentifier.startsWith("seed|"),
    );
    const admins = users.filter((user) => user.role === "admin");
    const others = users.filter((user) => user.role !== "admin");
    if (admins.length !== 1 || others.length !== 1) {
      throw new ConvexError(
        "Needs exactly two accounts: one admin (borrower) and one user (lender).",
      );
    }
    const [borrower] = admins;
    const [lender] = others;
    const existing = await ctx.db
      .query("tools")
      .withIndex("by_ownerId_and_removedAt", (q) => q.eq("ownerId", lender._id))
      .take(500);
    if (existing.some(isSeededTool)) {
      throw new ConvexError("Demo data is already seeded. Run devSeed:clearDemo first.");
    }

    const now = Date.now();
    const at = (days: number) => now + days * DAY;
    let loans = 0;

    for (let k = 0; k < LISTINGS; k++) {
      const [name, category, description, icon] = CATALOGUE[k];
      const toolId = await ctx.db.insert("tools", {
        ownerId: lender._id,
        name,
        nameLower: name.toLowerCase(),
        category,
        condition: CONDITIONS[k % CONDITIONS.length],
        description,
        icon,
      });

      // One request per listing, so approved loans never overlap on a tool.
      const pattern = LOAN_PATTERNS[k % LOAN_PATTERNS.length];
      const status = pattern.status;
      const start = pattern.start + (k % 3); // spread the dates a little
      const end = start + pattern.days - 1;
      const requestedAt = at(Math.min(start, 0) - 2);
      const decidedAt = at(Math.min(start, 0) - 1);
      const decided = status !== "pending" && status !== "cancelled";
      const loanId = await ctx.db.insert("loans", {
        toolId,
        ownerId: lender._id,
        borrowerId: borrower._id,
        startDate: toIsoDate(at(start)),
        endDate: toIsoDate(at(end)),
        status,
        decidedAt: decided ? decidedAt : undefined,
        returnedAt: status === "returned" ? at(end) : undefined,
        searchText: loanSearchText(name, lender.name, borrower.name),
      });
      loans++;

      // Automation history, as n8n would have written it back.
      const notified = (about: Doc<"loans">["status"], when: number) =>
        ctx.db.insert("automationEvents", {
          loanId,
          type: "request_notification",
          status: "sent",
          at: when,
          idempotencyKey: `notify:${loanId}:${about}`,
        });
      await notified("pending", requestedAt);
      if (decided) await notified(status === "declined" ? "declined" : "approved", decidedAt);
      if (status === "returned") await notified("returned", at(end));
      if (status === "approved" && end < 0) {
        for (let d = end + 1; d <= 0; d++) {
          await ctx.db.insert("automationEvents", {
            loanId,
            type: "overdue_reminder",
            status: "sent",
            at: at(d),
            idempotencyKey: `overdue:${loanId}:${toIsoDate(at(d))}`,
          });
        }
      }
    }

    return { tools: LISTINGS, loans };
  },
});

/**
 * Removes what demoData created: seeded listings (exact name + description,
 * so tools you made yourself stay), every loan and automation event on them,
 * and the neighbour accounts an earlier version of the seed added.
 *   pnpm convex run devSeed:clearDemo
 */
export const clearDemo = internalMutation({
  args: {},
  returns: v.object({ users: v.number(), tools: v.number(), loans: v.number() }),
  handler: async (ctx) => {
    const neighbours = (await ctx.db.query("users").take(200)).filter((user) =>
      user.tokenIdentifier.startsWith("seed|"),
    );
    const neighbourIds = new Set(neighbours.map((user) => user._id));
    const tools = (await ctx.db.query("tools").take(2000)).filter(
      (tool) => neighbourIds.has(tool.ownerId) || isSeededTool(tool),
    );
    const toolIds = new Set(tools.map((tool) => tool._id));
    const loans = (await ctx.db.query("loans").take(4000)).filter(
      (loan) => toolIds.has(loan.toolId) || neighbourIds.has(loan.borrowerId),
    );

    for (const loan of loans) {
      const events = await ctx.db
        .query("automationEvents")
        .withIndex("by_loanId", (q) => q.eq("loanId", loan._id))
        .take(100);
      for (const event of events) await ctx.db.delete("automationEvents", event._id);
      const outbox = await ctx.db
        .query("outbox")
        .withIndex("by_loanId_and_status", (q) => q.eq("loanId", loan._id))
        .take(20);
      for (const row of outbox) await ctx.db.delete("outbox", row._id);
      await ctx.db.delete("loans", loan._id);
    }
    for (const tool of tools) await ctx.db.delete("tools", tool._id);
    for (const user of neighbours) await ctx.db.delete("users", user._id);
    return { users: neighbours.length, tools: tools.length, loans: loans.length };
  },
});
