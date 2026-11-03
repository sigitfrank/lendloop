import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { roleValidator } from "./lib/validators";

/**
 * Creates or refreshes the caller's user row from their Clerk identity.
 * Called by the client once after sign-in. New users always start as "user";
 * admins are promoted from the CLI only (see setRole).
 */
export const store = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Please sign in to continue.");

    // name/email come from custom claims on the Clerk session token (see README).
    // `||` because Clerk sends "" when a user has no name.
    const name = identity.name || identity.givenName || "Neighbour";
    const email = identity.email || undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      if (existing.name !== name || existing.email !== email) {
        await ctx.db.patch("users", existing._id, { name, email });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role: "user",
      trustedLender: false,
    });
  },
});

/** The signed-in user's own profile for the UI (nav, badges). Null when signed out. */
export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      name: v.string(),
      role: roleValidator,
      trustedLender: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

/**
 * Role bootstrap, deliberately internal: callable only with the deployment's
 * admin credentials (CLI or dashboard), never from the browser.
 *   pnpm convex run users:setRole '{"email":"you@example.com","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { email: v.string(), role: roleValidator },
  returns: v.null(),
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) {
      throw new ConvexError("No user with that email. Sign in to the app once first.");
    }
    await ctx.db.patch("users", user._id, { role });
    return null;
  },
});
