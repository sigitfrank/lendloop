import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Automation log retention: every day at 03:00 UTC, delete rows older than 30 days.
crons.cron("prune automation log", "0 3 * * *", internal.automation.pruneLog, {});

export default crons;
