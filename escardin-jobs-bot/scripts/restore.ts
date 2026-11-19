// Restores a backup file into the database:  npm run restore -- path/to/escardin-2026-11-19.json
// WARNING: this REPLACES all current data with the backup's data.
import { readFileSync } from "node:fs";
import { BACKUP_TABLES } from "../src/backup";
import { closeDb, db, migrate } from "../src/db";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run restore -- path/to/backup.json");
  process.exit(1);
}
const backup = JSON.parse(readFileSync(file, "utf8"));
if (backup.format !== "escardin-backup-1") {
  console.error("This file is not an Escardin backup.");
  process.exit(1);
}

await migrate();
await db().begin(async (tx) => {
  await tx.unsafe(
    `TRUNCATE ${[...BACKUP_TABLES, "user_states", "processed_updates"].join(", ")} RESTART IDENTITY CASCADE`,
  );
  for (const table of BACKUP_TABLES) {
    const rows: Record<string, unknown>[] = backup.tables[table] ?? [];
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500);
      await tx`INSERT INTO ${tx(table)} ${tx(part as any[])}`;
    }
    console.log(`${table}: ${rows.length} rows`);
  }
  for (const table of ["users", "jobs", "job_events", "job_media", "date_offers", "notifications_sent"]) {
    await tx.unsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`,
    );
  }
});
console.log(`Restored from ${file} (made ${backup.created_at}).`);
await closeDb();
