import { paginationOptsValidator, type OrderedQuery } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  categoryValidator,
  loanFilterValidator,
  loanSortValidator,
  loanStatusValidator,
  type LoanFilter,
  type LoanSort,
  type LoanStatus,
} from "./validators";

// Shared by "My requests", "Incoming requests" and the admin "All loans" view.

const personValidator = v.object({ firstName: v.string(), trustedLender: v.boolean() });

/** A loan as shown in lists. People are first name only (no emails). */
export const loanViewValidator = v.object({
  _id: v.id("loans"),
  _creationTime: v.number(),
  status: loanStatusValidator,
  /** Derived: approved and the end date has passed. */
  overdue: v.boolean(),
  startDate: v.string(),
  endDate: v.string(),
  decidedAt: v.optional(v.number()),
  returnedAt: v.optional(v.number()),
  tool: v.object({ name: v.string(), category: categoryValidator, removed: v.boolean() }),
  lender: personValidator,
  borrower: personValidator,
});

function person(user: Doc<"users"> | null) {
  return {
    firstName: user?.name.split(" ")[0] ?? "A neighbour",
    trustedLender: user?.trustedLender ?? false,
  };
}

export async function toLoanView(ctx: QueryCtx, loan: Doc<"loans">, today: string) {
  const tool = await ctx.db.get("tools", loan.toolId);
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    status: loan.status,
    overdue: loan.status === "approved" && loan.endDate < today,
    startDate: loan.startDate,
    endDate: loan.endDate,
    decidedAt: loan.decidedAt,
    returnedAt: loan.returnedAt,
    tool: {
      name: tool?.name ?? "Removed tool",
      category: tool?.category ?? "other",
      removed: tool?.removedAt !== undefined,
    },
    lender: person(await ctx.db.get("users", loan.ownerId)),
    borrower: person(await ctx.db.get("users", loan.borrowerId)),
  };
}

export const loanListArgs = {
  paginationOpts: paginationOptsValidator,
  filter: v.optional(loanFilterValidator),
  search: v.optional(v.string()),
  sort: v.optional(loanSortValidator),
  today: v.string(), // client's "YYYY-MM-DD"; queries must not read the clock
};

/** Whose loans: one lender's, one borrower's, or everyone's (admin). */
export type LoanScope =
  | { ownerId: Id<"users"> }
  | { borrowerId: Id<"users"> }
  | "all";

type LoanQuery = OrderedQuery<DataModel["loans"]>;

/** Index-backed base query for a scope + stored status, ordered by creation or start date. */
function indexedLoans(
  ctx: QueryCtx,
  scope: LoanScope,
  status: LoanStatus | undefined,
  sort: LoanSort,
): LoanQuery {
  const loans = ctx.db.query("loans");
  const byStart = sort === "start_asc" || sort === "start_desc";
  const order = sort === "oldest" || sort === "start_asc" ? "asc" : "desc";

  if (scope === "all") {
    if (status) {
      return byStart
        ? loans.withIndex("by_status_and_startDate", (q) => q.eq("status", status)).order(order)
        : loans.withIndex("by_status", (q) => q.eq("status", status)).order(order);
    }
    return byStart
      ? loans.withIndex("by_startDate").order(order)
      : loans.order(order); // default creation-time order
  }

  if ("ownerId" in scope) {
    const { ownerId } = scope;
    if (status) {
      return byStart
        ? loans
            .withIndex("by_ownerId_and_status_and_startDate", (q) =>
              q.eq("ownerId", ownerId).eq("status", status),
            )
            .order(order)
        : loans
            .withIndex("by_ownerId_and_status", (q) =>
              q.eq("ownerId", ownerId).eq("status", status),
            )
            .order(order);
    }
    return byStart
      ? loans.withIndex("by_ownerId_and_startDate", (q) => q.eq("ownerId", ownerId)).order(order)
      : loans.withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).order(order);
  }

  const { borrowerId } = scope;
  if (status) {
    return byStart
      ? loans
          .withIndex("by_borrowerId_and_status_and_startDate", (q) =>
            q.eq("borrowerId", borrowerId).eq("status", status),
          )
          .order(order)
      : loans
          .withIndex("by_borrowerId_and_status", (q) =>
            q.eq("borrowerId", borrowerId).eq("status", status),
          )
          .order(order);
  }
  return byStart
    ? loans
        .withIndex("by_borrowerId_and_startDate", (q) => q.eq("borrowerId", borrowerId))
        .order(order)
    : loans.withIndex("by_borrowerId", (q) => q.eq("borrowerId", borrowerId)).order(order);
}

/**
 * Loans in a scope with filter, search and sort.
 * - Search is relevance-ordered (Convex search has no other ordering).
 * - "approved" / "overdue" split approved loans by end date. For everyone's
 *   loans (admin) that is an index range; for one user it runs after the index
 *   over that user's own approved loans (a small set).
 */
export function loansQuery(
  ctx: QueryCtx,
  scope: LoanScope,
  { filter, sort, search, today }: { filter: LoanFilter; sort: LoanSort; search?: string; today: string },
): LoanQuery {
  const status: LoanStatus | undefined =
    filter === "all" ? undefined : filter === "overdue" ? "approved" : filter;

  if (scope === "all" && !search && (filter === "overdue" || filter === "approved")) {
    return ctx.db
      .query("loans")
      .withIndex("by_status_and_endDate", (q) =>
        filter === "overdue"
          ? q.eq("status", "approved").lt("endDate", today)
          : q.eq("status", "approved").gte("endDate", today),
      )
      .order("asc"); // soonest due first
  }

  const base: LoanQuery = search
    ? ctx.db.query("loans").withSearchIndex("search_text", (q) => {
        const text = q.search("searchText", search);
        const scoped =
          scope === "all"
            ? text
            : "ownerId" in scope
              ? text.eq("ownerId", scope.ownerId)
              : text.eq("borrowerId", scope.borrowerId);
        return status ? scoped.eq("status", status) : scoped;
      })
    : indexedLoans(ctx, scope, status, sort);

  if (filter === "overdue") return base.filter((q) => q.lt(q.field("endDate"), today));
  if (filter === "approved") return base.filter((q) => q.gte(q.field("endDate"), today));
  return base;
}
