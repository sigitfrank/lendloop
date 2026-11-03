import { ConvexError, v, type Infer } from "convex/values";

// Enums shared by the schema, function args and the UI.

export const categoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("sports"),
  v.literal("other"),
);
export type Category = Infer<typeof categoryValidator>;

export const conditionValidator = v.union(
  v.literal("new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);
export type Condition = Infer<typeof conditionValidator>;

export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);
export type LoanStatus = Infer<typeof loanStatusValidator>;

export const roleValidator = v.union(v.literal("admin"), v.literal("user"));

/** Loan list filters: a status, "all", or the derived "overdue". */
export const loanFilterValidator = v.union(
  v.literal("all"),
  v.literal("pending"),
  v.literal("approved"),
  v.literal("overdue"),
  v.literal("returned"),
  v.literal("declined"),
  v.literal("cancelled"),
);
export type LoanFilter = Infer<typeof loanFilterValidator>;

export const loanSortValidator = v.union(
  v.literal("newest"),
  v.literal("oldest"),
  v.literal("start_asc"),
  v.literal("start_desc"),
);
export type LoanSort = Infer<typeof loanSortValidator>;

export const toolSortValidator = v.union(
  v.literal("newest"),
  v.literal("oldest"),
  v.literal("name_asc"),
  v.literal("name_desc"),
);
export type ToolSort = Infer<typeof toolSortValidator>;

export const SEARCH_MAX = 100;

// Limits enforced on the server (the UI mirrors them for inline feedback).

export const TOOL_NAME_MAX = 60;
export const TOOL_DESCRIPTION_MAX = 500;
export const MAX_LOAN_DAYS = 30;

/** Trims and length-checks free-text tool fields. Throws a user-safe error. */
export function cleanToolText(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length === 0) throw new ConvexError("Name is required.");
  if (name.length > TOOL_NAME_MAX) {
    throw new ConvexError(`Name must be at most ${TOOL_NAME_MAX} characters.`);
  }
  if (description.length > TOOL_DESCRIPTION_MAX) {
    throw new ConvexError(
      `Description must be at most ${TOOL_DESCRIPTION_MAX} characters.`,
    );
  }
  return { name, description };
}
