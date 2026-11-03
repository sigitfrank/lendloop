import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { env, httpAction, type ActionCtx } from "./_generated/server";
import { toIsoDate } from "./lib/dates";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from "./lib/hmac";
import { errorKey } from "./lib/keys";

// Endpoints called by n8n. Every request must be HMAC-signed (lib/hmac.ts) and
// recent; anything else gets 401 before touching the database. Write-backs are
// idempotent by key, so n8n retries never create duplicates.

const http = httpRouter();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A request problem we can describe to the caller (400). */
class BadRequest extends Error {}

type Handler = (ctx: ActionCtx, body: string, url: URL) => Promise<Response>;

/** Verify the signature, then run the handler; bad input → 400, never internals. */
function signedRoute(handler: Handler) {
  return httpAction(async (ctx, request) => {
    const secret = env.LENDLOOP_HMAC_SECRET;
    if (!secret) return json(503, { error: "Not configured" });

    const url = new URL(request.url);
    const body = await request.text();
    const valid = await verify(
      secret,
      {
        timestamp: request.headers.get(TIMESTAMP_HEADER) ?? "",
        method: request.method,
        path: url.pathname + url.search,
        body,
      },
      request.headers.get(SIGNATURE_HEADER) ?? "",
      Math.floor(Date.now() / 1000),
    );
    if (!valid) return json(401, { error: "Invalid signature" });

    try {
      return await handler(ctx, body, url);
    } catch (err) {
      if (err instanceof BadRequest) return json(400, { error: err.message });
      if (err instanceof ConvexError) return json(400, { error: String(err.data) });
      throw err; // unexpected: Convex logs it and returns 500
    }
  });
}

/** Reads the named string fields from a JSON object body. */
function readFields<R extends string, O extends string = never>(
  body: string,
  required: R[],
  optional: O[] = [],
): Record<R, string> & Partial<Record<O, string>> {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new BadRequest("Body must be JSON");
  }
  if (typeof data !== "object" || data === null) throw new BadRequest("Body must be an object");
  const record = data as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of [...required, ...optional]) {
    const value = record[key];
    if (value === undefined && !(required as string[]).includes(key)) continue;
    if (typeof value !== "string" || value.length === 0 || value.length > 1000) {
      throw new BadRequest(`Invalid field: ${key}`);
    }
    out[key] = value;
  }
  return out as Record<R, string> & Partial<Record<O, string>>;
}

function readStatus(value: string): "sent" | "failed" {
  if (value !== "sent" && value !== "failed") throw new BadRequest("status must be sent or failed");
  return value;
}

/** Write-back for one automation result, keyed for idempotency. */
function writeBack(type: "request_notification" | "overdue_reminder", keyPrefix: string): Handler {
  return async (ctx, body) => {
    const f = readFields(body, ["idempotencyKey", "loanId", "status"], ["detail"]);
    if (!f.idempotencyKey.startsWith(keyPrefix)) throw new BadRequest("Invalid idempotencyKey");
    const result = await ctx.runMutation(internal.automation.recordEvent, {
      idempotencyKey: f.idempotencyKey,
      type,
      status: readStatus(f.status),
      loanId: f.loanId,
      detail: f.detail,
    });
    return json(200, { ok: true, ...result });
  };
}

// WF2: approved loans past their end date that haven't been reminded today.
http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: signedRoute(async (ctx) => {
    const today = toIsoDate(Date.now());
    const loans = await ctx.runQuery(internal.automation.overdueLoans, { today });
    return json(200, { today, loans });
  }),
});

// WF1: lets n8n skip a notification that was already sent (safe re-delivery).
http.route({
  path: "/n8n/event-status",
  method: "GET",
  handler: signedRoute(async (ctx, _body, url) => {
    const key = url.searchParams.get("key");
    if (!key) throw new BadRequest("Missing key");
    const status = await ctx.runQuery(internal.automation.eventStatus, { idempotencyKey: key });
    return json(200, { status });
  }),
});

// WF1 / WF2 write-backs.
http.route({
  path: "/n8n/notification-status",
  method: "POST",
  handler: signedRoute(writeBack("request_notification", "notify:")),
});
http.route({
  path: "/n8n/reminder-status",
  method: "POST",
  handler: signedRoute(writeBack("overdue_reminder", "overdue:")),
});

// WF3 (error workflow): failed n8n executions are reported here, so failures
// show up in the app instead of only in n8n's execution log.
http.route({
  path: "/n8n/automation-error",
  method: "POST",
  handler: signedRoute(async (ctx, body) => {
    const f = readFields(body, ["executionId", "workflow", "message"], ["node", "loanId"]);
    const where = f.node ? `${f.workflow} › ${f.node}` : f.workflow;
    const result = await ctx.runMutation(internal.automation.recordEvent, {
      idempotencyKey: errorKey(f.executionId),
      type: "error",
      status: "failed",
      loanId: f.loanId,
      detail: `${where}: ${f.message}`,
    });
    return json(200, { ok: true, ...result });
  }),
});

export default http;
