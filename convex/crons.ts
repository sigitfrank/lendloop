import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Automation log retention: every day at 03:00 UTC, delete rows older than 30 days.
crons.cron("prune automation log", "0 3 * * *", internal.automation.pruneLog, {});

// MCP audit log retention: 90 days.
crons.cron("prune MCP audit log", "15 3 * * *", internal.mcp.pruneAuditLog, {});

// Close requests nobody answered before their start date (00:05 UTC, after "today" changes).
crons.cron("expire stale requests", "5 0 * * *", internal.loans.expireStaleRequests, {});

// Safety net for loan notifications whose delivery never recorded an attempt.
crons.interval("sweep stuck outbox", { minutes: 10 }, internal.outbox.sweepStuck, {});

export default crons;
