import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  categoryValidator,
  conditionValidator,
  loanStatusValidator,
  roleValidator,
  toolIconValidator,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    // Stable id from the Clerk JWT, issued as `${issuer}|${subject}`.
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    // Authorisation source of truth. Never read from the client or Clerk metadata.
    role: roleValidator,
    trustedLender: v.boolean(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_email", ["email"])
    // Admin user list: filter by role / trusted, search by name.
    .index("by_role", ["role"])
    .index("by_trustedLender", ["trustedLender"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["role", "trustedLender"] }),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    // Lower-cased copy of `name` so A–Z sorting ignores capitalisation.
    nameLower: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    // Picked by the lender; when absent the UI shows the category's default icon.
    icon: v.optional(toolIconValidator),
    // Soft delete (by the owner or an admin) keeps loan history intact.
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.union(v.literal("owner"), v.literal("admin"))),
  })
    // Active listings are eq("removedAt", undefined). One index per (scope × sort):
    // creation-order indexes give newest/oldest, *_nameLower ones give A–Z/Z–A.
    .index("by_removedAt", ["removedAt"])
    .index("by_removedAt_and_nameLower", ["removedAt", "nameLower"])
    .index("by_removedAt_and_category", ["removedAt", "category"])
    .index("by_removedAt_and_category_and_nameLower", ["removedAt", "category", "nameLower"])
    .index("by_ownerId_and_removedAt", ["ownerId", "removedAt"])
    .index("by_ownerId_and_removedAt_and_nameLower", ["ownerId", "removedAt", "nameLower"])
    // Full-text search on the name (results are relevance-ordered).
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["removedAt", "category", "ownerId"],
    }),

  // One row per borrow request.
  loans: defineTable({
    toolId: v.id("tools"),
    // Denormalised from the tool so ownership checks need no extra read.
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(), // "YYYY-MM-DD", inclusive
    endDate: v.string(), // "YYYY-MM-DD", inclusive
    status: loanStatusValidator,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    // Overdue is derived: status "approved" and endDate < today.
    // Snapshot at request time of tool name + both first names, for search.
    searchText: v.string(),
  })
    .index("by_toolId_and_status", ["toolId", "status"])
    // My requests / Incoming: one index per (side × status filter × sort).
    // Plain indexes order by creation (newest/oldest); *_startDate by start date.
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_startDate", ["ownerId", "startDate"])
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_ownerId_and_status_and_startDate", ["ownerId", "status", "startDate"])
    .index("by_borrowerId", ["borrowerId"])
    .index("by_borrowerId_and_startDate", ["borrowerId", "startDate"])
    .index("by_borrowerId_and_status", ["borrowerId", "status"])
    .index("by_borrowerId_and_status_and_startDate", ["borrowerId", "status", "startDate"])
    // Admin "all loans" (creation order uses the built-in index).
    .index("by_startDate", ["startDate"])
    .index("by_status", ["status"])
    .index("by_status_and_startDate", ["status", "startDate"])
    // Overdue: approved loans whose endDate has passed (admin view, n8n reminders).
    .index("by_status_and_endDate", ["status", "endDate"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["ownerId", "borrowerId", "status"],
    }),

  // Audit trail of automation outcomes; idempotencyKey makes write-backs safe to retry.
  automationEvents: defineTable({
    loanId: v.optional(v.id("loans")), // absent for workflow-level errors
    type: v.union(
      v.literal("request_notification"),
      v.literal("overdue_reminder"),
      v.literal("error"),
    ),
    status: v.union(v.literal("sent"), v.literal("failed")),
    detail: v.optional(v.string()),
    at: v.number(),
    idempotencyKey: v.string(),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_loanId", ["loanId"]),

  // Convex → n8n deliveries, written in the same transaction as the loan change.
  // The row's _id is the event id; the payload is built at delivery time.
  outbox: defineTable({
    loanId: v.id("loans"),
    event: loanStatusValidator, // the loan status this event announces
    idempotencyKey: v.string(), // notify:{loanId}:{status}
    status: v.union(v.literal("pending"), v.literal("delivered"), v.literal("failed")),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_loanId_and_status", ["loanId", "status"]) // retries shown on the loan
    .index("by_status_and_nextAttemptAt", ["status", "nextAttemptAt"]),

  // One row per tool call Claude makes through the MCP route (audit trail).
  // Tool name and outcome only; no arguments or free text.
  mcpAuditLog: defineTable({
    userId: v.id("users"),
    tool: v.string(),
    status: v.union(v.literal("started"), v.literal("ok"), v.literal("error")),
    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  // HTTP-level log of every call between Convex and n8n (both directions), for
  // the admin "Automation log". No payloads, secrets or emails. Kept 30 days
  // (crons.ts prunes older rows).
  automationLog: defineTable({
    direction: v.union(v.literal("to_n8n"), v.literal("from_n8n")),
    method: v.string(),
    path: v.string(),
    statusCode: v.number(), // 0 = network error / no response
    ok: v.boolean(), // 2xx
    durationMs: v.optional(v.number()),
    loanId: v.optional(v.id("loans")),
    detail: v.optional(v.string()),
    // Method, path, status, tool name and message, for admin search. Optional
    // only because older rows predate it; they age out after 30 days.
    searchText: v.optional(v.string()),
  })
    .index("by_ok", ["ok"])
    .index("by_statusCode", ["statusCode"])
    .index("by_path", ["path"]) // e.g. n8n workflow error reports
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["ok", "statusCode", "path"],
    }),
});
