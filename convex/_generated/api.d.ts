/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as automation from "../automation.js";
import type * as crons from "../crons.js";
import type * as devSeed from "../devSeed.js";
import type * as http from "../http.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_hmac from "../lib/hmac.js";
import type * as lib_keys from "../lib/keys.js";
import type * as lib_loanViews from "../lib/loanViews.js";
import type * as lib_mcp from "../lib/mcp.js";
import type * as lib_outbox from "../lib/outbox.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_validators from "../lib/validators.js";
import type * as loans from "../loans.js";
import type * as mcp from "../mcp.js";
import type * as outbox from "../outbox.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  automation: typeof automation;
  crons: typeof crons;
  devSeed: typeof devSeed;
  http: typeof http;
  "lib/activity": typeof lib_activity;
  "lib/auth": typeof lib_auth;
  "lib/availability": typeof lib_availability;
  "lib/dates": typeof lib_dates;
  "lib/hmac": typeof lib_hmac;
  "lib/keys": typeof lib_keys;
  "lib/loanViews": typeof lib_loanViews;
  "lib/mcp": typeof lib_mcp;
  "lib/outbox": typeof lib_outbox;
  "lib/pagination": typeof lib_pagination;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/search": typeof lib_search;
  "lib/validators": typeof lib_validators;
  loans: typeof loans;
  mcp: typeof mcp;
  outbox: typeof outbox;
  tools: typeof tools;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
