import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { isMcpCall, requireUser } from "./lib/auth";

// Guardrails around MCP tool calls (Claude). The MCP route calls startCall
// before every tool and finishCall after it, as the signed-in user.

const rateLimiter = new RateLimiter(components.rateLimiter, {
  // 60 tool calls per minute per user, with short bursts allowed.
  mcpToolCall: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
});

/** Rate-limits the user and opens an audit row. MCP identities only. */
export const startCall = mutation({
  args: { tool: v.string() },
  returns: v.id("mcpAuditLog"),
  handler: async (ctx, { tool }) => {
    const user = await requireUser(ctx);
    if (!(await isMcpCall(ctx))) throw new ConvexError("Only available to MCP clients.");

    const { ok, retryAfter } = await rateLimiter.limit(ctx, "mcpToolCall", { key: user._id });
    if (!ok) {
      const seconds = Math.ceil((retryAfter ?? 0) / 1000);
      throw new ConvexError(`Too many requests. Try again in ${seconds} seconds.`);
    }
    return await ctx.db.insert("mcpAuditLog", {
      userId: user._id,
      tool: tool.slice(0, 64),
      status: "started",
    });
  },
});

/** Records the outcome of a call opened with startCall. */
export const finishCall = mutation({
  args: {
    callId: v.id("mcpAuditLog"),
    ok: v.boolean(),
    error: v.optional(v.string()),
    durationMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { callId, ok, error, durationMs }) => {
    const user = await requireUser(ctx);
    const call = await ctx.db.get("mcpAuditLog", callId);
    if (!call || call.userId !== user._id) throw new ConvexError("Unknown call.");
    await ctx.db.patch("mcpAuditLog", callId, {
      status: ok ? "ok" : "error",
      error: error?.slice(0, 300),
      durationMs,
    });
    return null;
  },
});

/** The signed-in user's recent Claude actions (newest first). */
export const myRecentCalls = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("mcpAuditLog"),
      _creationTime: v.number(),
      tool: v.string(),
      status: v.union(v.literal("started"), v.literal("ok"), v.literal("error")),
      error: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const calls = await ctx.db
      .query("mcpAuditLog")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(20);
    return calls.map(({ _id, _creationTime, tool, status, error }) => ({
      _id,
      _creationTime,
      tool,
      status,
      error,
    }));
  },
});
