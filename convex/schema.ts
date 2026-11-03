import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    // Stable id from the Clerk JWT, issued as `${issuer}|${subject}`.
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    // Authorisation source of truth. Never read from the client or Clerk metadata.
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),
});
