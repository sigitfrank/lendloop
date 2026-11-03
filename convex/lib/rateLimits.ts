import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// Per-user limits (Convex rate-limiter component). Consumed inside the calling
// mutation's transaction, so a request that fails later doesn't use up a token.
const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Claude (MCP): 60 tool calls per minute, short bursts allowed.
  mcpToolCall: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 20 },
  // Borrow requests: each one emails the lender, so a request/cancel loop
  // can't flood someone's inbox. Generous for real use.
  loanRequest: { kind: "token bucket", rate: 20, period: HOUR, capacity: 10 },
});

export async function enforceRateLimit(
  ctx: MutationCtx,
  name: "mcpToolCall" | "loanRequest",
  userId: Id<"users">,
) {
  const { ok, retryAfter } = await rateLimiter.limit(ctx, name, { key: userId });
  if (!ok) {
    const seconds = Math.ceil((retryAfter ?? 0) / 1000);
    const wait = seconds > 90 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
    throw new ConvexError(`Too many requests. Try again in ${wait}.`);
  }
}
