import { ConvexError } from "convex/values";

/**
 * Server functions throw ConvexError with a user-safe message. Anything else
 * (network, unexpected bugs) gets a generic message; details stay in the logs.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return "Something went wrong. Please try again.";
}
