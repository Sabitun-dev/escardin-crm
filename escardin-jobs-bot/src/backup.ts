// Daily database backups stored in Netlify Blobs, kept for 14 days.
import { getStore } from "@netlify/blobs";
import { db } from "./db";
import { addDays } from "./time";

export const BACKUP_TABLES = [
  "users",
  "invites",
  "jobs",
  "job_checks",
  "job_events",
  "job_media",
  "date_offers",
  "notifications_sent",
  "scheduler_runs",
] as const;

const KEEP_DAYS = 14;

export async function dumpDatabase(): Promise<string> {
  const tables: Record<string, unknown[]> = {};
  for (const name of BACKUP_TABLES) tables[name] = await db().unsafe(`SELECT * FROM ${name} ORDER BY 1`);
  return JSON.stringify({ format: "escardin-backup-1", created_at: new Date().toISOString(), tables });
}

function store() {
  return getStore("backups");
}

/** Saves today's backup and removes ones older than 14 days. */
export async function storeBackup(today: string): Promise<string> {
  const key = `escardin-${today}.json`;
  const s = store();
  await s.set(key, await dumpDatabase());
  const cutoff = `escardin-${addDays(today, -KEEP_DAYS)}.json`;
  const { blobs } = await s.list();
  for (const b of blobs) if (b.key < cutoff) await s.delete(b.key);
  return key;
}

export type LatestBackup = { key: string; data: string } | null | "unavailable";

export async function latestBackup(): Promise<LatestBackup> {
  let s;
  try {
    s = store();
    const { blobs } = await s.list();
    const key = blobs.map((b) => b.key).sort().pop();
    if (!key) return null;
    const data = await s.get(key, { type: "text" });
    return data ? { key, data } : null;
  } catch (e) {
    if (e instanceof Error && /environment|siteID|token|configured/i.test(e.message)) return "unavailable";
    throw e;
  }
}
