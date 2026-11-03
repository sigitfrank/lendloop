import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { isMcpCall, requireUser } from "./lib/auth";
import { enforceRateLimit } from "./lib/rateLimits";

// Guardrails around MCP tool calls (Claude). The MCP route calls startCall
// before every tool and finishCall after it, as the signed-in user.

/** Rate-limits the user and opens an audit row. MCP identities only. */
export const startCall = mutation({
  args: { tool: v.string() },
  returns: v.id("mcpAuditLog"),
  handler: async (ctx, { tool }) => {
    const user = await requireUser(ctx);
    if (!(await isMcpCall(ctx))) throw new ConvexError("Only available to MCP clients.");

    await enforceRateLimit(ctx, "mcpToolCall", user._id);
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

const AUDIT_RETENTION_DAYS = 90;
const PRUNE_BATCH = 500;

/** Cron: delete MCP audit rows older than 90 days. */
export const pruneAuditLog = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("mcpAuditLog")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .take(PRUNE_BATCH);
    for (const row of old) await ctx.db.delete("mcpAuditLog", row._id);
    if (old.length === PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.mcp.pruneAuditLog, {});
    }
    return { deleted: old.length };
  },
});
