import {
  paginationOptsValidator,
  paginationResultValidator,
  type OrderedQuery,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireToolOwner, requireUser } from "./lib/auth";
import { boundedPage } from "./lib/pagination";
import { availabilityValidator, getAvailability } from "./lib/availability";
import { cleanSearch } from "./lib/search";
import {
  SEARCH_MAX,
  categoryValidator,
  cleanToolText,
  conditionValidator,
  toolIconValidator,
  toolSortValidator,
  type Category,
  type ToolSort,
} from "./lib/validators";

const PUBLIC_LIST_LIMIT = 48;
const MAX_PENDING_CHECKED = 100;

/** What a signed-in user sees for a tool. Owner identity is first name only. */
const toolCardValidator = v.object({
  _id: v.id("tools"),
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
  icon: v.optional(toolIconValidator),
  owner: v.object({ firstName: v.string(), trustedLender: v.boolean() }),
  isOwn: v.boolean(),
  /** The viewer already has a pending request on this tool. */
  requestedByMe: v.boolean(),
  availability: availabilityValidator,
});

async function toToolCard(ctx: QueryCtx, tool: Doc<"tools">, viewerId: Id<"users">, today: string) {
  const owner = await ctx.db.get("users", tool.ownerId);
  const isOwn = tool.ownerId === viewerId;
  const pending = isOwn
    ? []
    : await ctx.db
        .query("loans")
        .withIndex("by_toolId_and_status", (q) => q.eq("toolId", tool._id).eq("status", "pending"))
        .take(MAX_PENDING_CHECKED);
  return {
    _id: tool._id,
    name: tool.name,
    category: tool.category,
    condition: tool.condition,
    description: tool.description,
    icon: tool.icon,
    owner: {
      firstName: owner?.name.split(" ")[0] ?? "A neighbour",
      trustedLender: owner?.trustedLender ?? false,
    },
    isOwn,
    requestedByMe: pending.some((loan) => loan.borrowerId === viewerId),
    availability: await getAvailability(ctx, tool._id, today),
  };
}

type ToolScope = { category?: Category; ownerId?: Id<"users"> };

/**
 * Active (not removed) tools for a scope, ordered server-side.
 * Every branch uses an index; a search query is relevance-ordered instead.
 */
function activeTools(
  ctx: QueryCtx,
  { category, ownerId }: ToolScope,
  sort: ToolSort,
  search: string | undefined,
): OrderedQuery<DataModel["tools"]> {
  const tools = ctx.db.query("tools");

  if (search) {
    return tools.withSearchIndex("search_name", (q) => {
      let s = q.search("name", search).eq("removedAt", undefined);
      if (ownerId) s = s.eq("ownerId", ownerId);
      if (category) s = s.eq("category", category);
      return s;
    });
  }

  const direction = sort === "oldest" || sort === "name_asc" ? "asc" : "desc";
  const byName = sort === "name_asc" || sort === "name_desc";

  if (ownerId) {
    return byName
      ? tools
          .withIndex("by_ownerId_and_removedAt_and_nameLower", (q) =>
            q.eq("ownerId", ownerId).eq("removedAt", undefined),
          )
          .order(direction)
      : tools
          .withIndex("by_ownerId_and_removedAt", (q) =>
            q.eq("ownerId", ownerId).eq("removedAt", undefined),
          )
          .order(direction);
  }
  if (category) {
    return byName
      ? tools
          .withIndex("by_removedAt_and_category_and_nameLower", (q) =>
            q.eq("removedAt", undefined).eq("category", category),
          )
          .order(direction)
      : tools
          .withIndex("by_removedAt_and_category", (q) =>
            q.eq("removedAt", undefined).eq("category", category),
          )
          .order(direction);
  }
  return byName
    ? tools
        .withIndex("by_removedAt_and_nameLower", (q) => q.eq("removedAt", undefined))
        .order(direction)
    : tools.withIndex("by_removedAt", (q) => q.eq("removedAt", undefined)).order(direction);
}

const listArgs = {
  paginationOpts: paginationOptsValidator,
  search: v.optional(v.string()),
  sort: v.optional(toolSortValidator),
  today: v.string(), // client's "YYYY-MM-DD"; queries must not read the clock
};

/**
 * Public, signed-out landing list. Returns ONLY name + category: no owner,
 * description or availability (data minimisation).
 */
export const listPublic = query({
  args: {},
  returns: v.array(v.object({ _id: v.id("tools"), name: v.string(), category: categoryValidator })),
  handler: async (ctx) => {
    const tools = await activeTools(ctx, {}, "newest", undefined).take(PUBLIC_LIST_LIMIT);
    return tools.map(({ _id, name, category }) => ({ _id, name, category }));
  },
});

/** All active tools with availability; category filter, search and sort. */
export const list = query({
  args: { ...listArgs, category: v.optional(categoryValidator) },
  returns: paginationResultValidator(toolCardValidator),
  handler: async (ctx, { paginationOpts, category, search, sort, today }) => {
    const user = await requireUser(ctx);
    const result = await activeTools(
      ctx,
      { category },
      sort ?? "newest",
      cleanSearch(search, SEARCH_MAX),
    ).paginate(boundedPage(paginationOpts));
    const page = await Promise.all(
      result.page.map((tool) => toToolCard(ctx, tool, user._id, today)),
    );
    return { ...result, page };
  },
});

/** The caller's own active listings; search and sort. */
export const mine = query({
  args: listArgs,
  returns: paginationResultValidator(toolCardValidator),
  handler: async (ctx, { paginationOpts, search, sort, today }) => {
    const user = await requireUser(ctx);
    const result = await activeTools(
      ctx,
      { ownerId: user._id },
      sort ?? "newest",
      cleanSearch(search, SEARCH_MAX),
    ).paginate(boundedPage(paginationOpts));
    const page = await Promise.all(
      result.page.map((tool) => toToolCard(ctx, tool, user._id, today)),
    );
    return { ...result, page };
  },
});

const toolFields = {
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
  icon: v.optional(toolIconValidator), // absent → category default
};

export const create = mutation({
  args: toolFields,
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { name, description } = cleanToolText(args);
    return await ctx.db.insert("tools", {
      ownerId: user._id, // always the caller, never a client-supplied id
      name,
      nameLower: name.toLowerCase(),
      description,
      category: args.category,
      condition: args.condition,
      icon: args.icon,
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  returns: v.null(),
  handler: async (ctx, { toolId, ...args }) => {
    await requireToolOwner(ctx, toolId);
    const { name, description } = cleanToolText(args);
    await ctx.db.patch("tools", toolId, {
      name,
      nameLower: name.toLowerCase(),
      description,
      category: args.category,
      condition: args.condition,
      icon: args.icon,
    });
    return null;
  },
});

/** Owner removes their listing (soft delete). Blocked while requests are open. */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, { toolId }) => {
    await requireToolOwner(ctx, toolId);
    const hasLoanIn = async (status: "approved" | "pending") =>
      (await ctx.db
        .query("loans")
        .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", status))
        .first()) !== null;

    if (await hasLoanIn("approved")) {
      throw new ConvexError("This tool has an approved loan. Mark it returned before deleting it.");
    }
    if (await hasLoanIn("pending")) {
      throw new ConvexError(
        "This tool has pending requests. Approve or decline them before deleting it.",
      );
    }
    await ctx.db.patch("tools", toolId, { removedAt: Date.now(), removedBy: "owner" });
    return null;
  },
});
