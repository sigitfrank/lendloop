import { ConvexError } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Creates or refreshes the caller's user row from their Clerk identity.
 * Called by the client once after sign-in. New users always start as "user";
 * admins are promoted from the CLI only.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not signed in");

    // name/email come from custom claims on the Clerk session token (see README).
    // `||` because Clerk sends "" when a user has no name.
    const name = identity.name || identity.givenName || "Neighbour";
    const email = identity.email || undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
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
