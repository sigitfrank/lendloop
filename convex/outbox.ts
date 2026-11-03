import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, sign } from "./lib/hmac";

// Convex → n8n delivery of loan events, with retries.
// Flow: a loan mutation calls enqueueLoanNotification (lib/outbox.ts) →
// deliver() POSTs a signed, minimal payload to N8N_WEBHOOK_URL →
// recordAttempt() marks it delivered, or schedules a retry with backoff, or
// after MAX_ATTEMPTS marks it failed and records a visible automation event.

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]; // after attempts 1..4

/** Who gets told about each status: the lender hears about new/cancelled requests. */
function recipientSide(status: Doc<"loans">["status"]): "lender" | "borrower" {
  return status === "pending" || status === "cancelled" ? "lender" : "borrower";
}

const payloadValidator = v.object({
  eventId: v.id("outbox"),
  idempotencyKey: v.string(),
  event: v.union(v.literal("loan.created"), v.literal("loan.status_changed")),
  status: v.string(),
  loan: v.object({ id: v.id("loans"), startDate: v.string(), endDate: v.string() }),
  toolName: v.string(),
  recipient: v.object({
    role: v.union(v.literal("lender"), v.literal("borrower")),
    firstName: v.string(),
    email: v.string(),
  }),
  otherPartyFirstName: v.string(),
});

/**
 * The payload n8n receives. Only what the email needs (data minimisation):
 * no descriptions, no other users' emails, no internal ids beyond loan/event.
 */
export const payloadFor = internalQuery({
  args: { outboxId: v.id("outbox") },
  returns: v.union(
    v.object({ ready: v.literal(false), reason: v.string() }),
    v.object({ ready: v.literal(true), payload: payloadValidator }),
  ),
  handler: async (ctx, { outboxId }) => {
    const row = await ctx.db.get("outbox", outboxId);
    if (!row || row.status !== "pending") return { ready: false as const, reason: "not pending" };
    const loan = await ctx.db.get("loans", row.loanId);
    if (!loan) return { ready: false as const, reason: "loan not found" };

    const tool = await ctx.db.get("tools", loan.toolId);
    const lender = await ctx.db.get("users", loan.ownerId);
    const borrower = await ctx.db.get("users", loan.borrowerId);
    const side = recipientSide(row.event);
    const recipient = side === "lender" ? lender : borrower;
    const other = side === "lender" ? borrower : lender;
    if (!recipient?.email) return { ready: false as const, reason: "recipient has no email" };

    return {
      ready: true as const,
      payload: {
        eventId: row._id,
        idempotencyKey: row.idempotencyKey,
        event: row.event === "pending" ? ("loan.created" as const) : ("loan.status_changed" as const),
        status: row.event,
        loan: { id: loan._id, startDate: loan.startDate, endDate: loan.endDate },
        toolName: tool?.name ?? "a tool",
        recipient: {
          role: side,
          firstName: recipient.name.split(" ")[0],
          email: recipient.email,
        },
        otherPartyFirstName: other?.name.split(" ")[0] ?? "A neighbour",
      },
    };
  },
});

/** One delivery attempt. Never throws: every outcome is recorded. */
export const deliver = internalAction({
  args: { outboxId: v.id("outbox") },
  returns: v.null(),
  handler: async (ctx, { outboxId }) => {
    const prepared = await ctx.runQuery(internal.outbox.payloadFor, { outboxId });
    if (!prepared.ready) {
      if (prepared.reason !== "not pending") {
        // Permanent problem (e.g. no email): fail now instead of retrying.
        await ctx.runMutation(internal.outbox.recordAttempt, {
          outboxId,
          ok: false,
          error: prepared.reason,
          permanent: true,
        });
      }
      return null;
    }

    const url = env.N8N_WEBHOOK_URL;
    const secret = env.LENDLOOP_HMAC_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.outbox.recordAttempt, {
        outboxId,
        ok: false,
        error: "N8N_WEBHOOK_URL or LENDLOOP_HMAC_SECRET is not set",
      });
      return null;
    }

    const body = JSON.stringify(prepared.payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { pathname, search } = new URL(url);
    const signature = await sign(secret, {
      timestamp,
      method: "POST",
      path: pathname + search,
      body,
    });

    let error: string | undefined;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signature,
        },
        body,
      });
      if (!response.ok) error = `n8n responded ${response.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : "network error";
    }

    await ctx.runMutation(internal.outbox.recordAttempt, { outboxId, ok: !error, error });
    return null;
  },
});

/** Mark delivered, schedule a retry with backoff, or give up visibly. */
export const recordAttempt = internalMutation({
  args: {
    outboxId: v.id("outbox"),
    ok: v.boolean(),
    error: v.optional(v.string()),
    permanent: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { outboxId, ok, error, permanent }) => {
    const row = await ctx.db.get("outbox", outboxId);
    if (!row || row.status !== "pending") return null;

    if (ok) {
      await ctx.db.patch("outbox", outboxId, { status: "delivered", lastError: undefined });
      return null;
    }

    const attempts = row.attempts + 1;
    if (!permanent && attempts < MAX_ATTEMPTS) {
      const delay = RETRY_DELAYS_MS[attempts - 1];
      await ctx.db.patch("outbox", outboxId, {
        attempts,
        lastError: error,
        nextAttemptAt: Date.now() + delay,
      });
      await ctx.scheduler.runAfter(delay, internal.outbox.deliver, { outboxId });
      return null;
    }

    // Out of retries: mark failed and make it visible on the loan and in admin.
    await ctx.db.patch("outbox", outboxId, { status: "failed", attempts, lastError: error });
    await ctx.runMutation(internal.automation.recordEvent, {
      idempotencyKey: row.idempotencyKey,
      type: "request_notification",
      status: "failed",
      loanId: row.loanId,
      detail: `Couldn't reach n8n after ${attempts} attempt${attempts === 1 ? "" : "s"}: ${error ?? "unknown error"}`,
    });
    return null;
  },
});
