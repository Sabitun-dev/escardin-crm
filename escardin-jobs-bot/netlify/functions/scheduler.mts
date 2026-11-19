// Runs every 15 minutes. Daily reminders, backups and the weekly report each run once,
// after the times set in DAILY_CHECK_TIME / WEEKLY_REPORT_DAY / WEEKLY_REPORT_TIME.
import type { Config } from "@netlify/functions";
import { getBot } from "../../src/bot";
import { ensureMigrated } from "../../src/db";
import { describe } from "../../src/notify";
import { runScheduled } from "../../src/scheduler";

export default async () => {
  try {
    await ensureMigrated();
    await runScheduled(getBot().api);
  } catch (e) {
    console.error("scheduler failed:", describe(e));
  }
};

export const config: Config = { schedule: "*/15 * * * *" };
