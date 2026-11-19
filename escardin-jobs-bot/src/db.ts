// Database connection and versioned schema (migrations).
// To add a change later: append a new { version, sql } entry to MIGRATIONS. Never edit an old one.
import postgres from "postgres";
import { cfg } from "./config";

function connect() {
  return postgres(cfg.dbUrl(), {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // required for Neon/pgBouncer pooled connections
    onnotice: () => {},
    types: {
      // BIGINT columns (Telegram IDs, so'm amounts, counts) as plain numbers
      int8: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      // DATE columns as "YYYY-MM-DD" strings
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });
}

export type Sql = postgres.ISql<any>;
let client: postgres.Sql<any> | null = null;

export function db() {
  if (!client) client = connect() as unknown as postgres.Sql<any>;
  return client;
}

export async function closeDb() {
  if (client) await client.end({ timeout: 5 });
  client = null;
}

export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('seller','tailor','admin')),
  language TEXT NOT NULL DEFAULT 'uz',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_reachable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('seller','tailor','admin')),
  name TEXT NOT NULL,
  created_by INT REFERENCES users(id),
  used_by INT REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  install_date DATE NOT NULL,
  price BIGINT NOT NULL DEFAULT 0,
  seller_id INT NOT NULL REFERENCES users(id),
  tailor_id INT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  closed_by INT REFERENCES users(id),
  closed_with_exception BOOLEAN NOT NULL DEFAULT false,
  exception_reason TEXT,
  group_message_id BIGINT
);
CREATE INDEX jobs_status_date ON jobs (status, install_date);

CREATE TABLE job_checks (
  job_id INT NOT NULL REFERENCES jobs(id),
  check_key TEXT NOT NULL CHECK (check_key IN ('materials','ready','quality','label','video','payment')),
  value TEXT,
  note TEXT,
  promised_date DATE,
  delivered_claimed BOOLEAN NOT NULL DEFAULT false,
  amount BIGINT,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMPTZ,
  PRIMARY KEY (job_id, check_key)
);

CREATE TABLE job_events (
  id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES jobs(id),
  user_id INT REFERENCES users(id),
  event_type TEXT NOT NULL,
  check_key TEXT,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_events_job ON job_events (job_id, id);

CREATE TABLE job_media (
  id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES jobs(id),
  kind TEXT NOT NULL CHECK (kind IN ('video','photo')),
  telegram_file_id TEXT NOT NULL,
  caption TEXT,
  uploaded_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications_sent (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  job_id INT NOT NULL DEFAULT 0,
  user_id INT NOT NULL DEFAULT 0,
  sent_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, job_id, user_id, sent_date)
);

-- What a user is in the middle of typing (job name, note, amount...)
CREATE TABLE user_states (
  user_id INT PRIMARY KEY REFERENCES users(id),
  state TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Telegram may resend an update; each is handled once
CREATE TABLE processed_updates (
  update_id BIGINT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily/weekly runs that already finished
CREATE TABLE scheduler_runs (
  kind TEXT NOT NULL,
  run_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, run_key)
);
`,
  },
  {
    // New role "smm" (steps 3–5), and new install dates suggested by tailors for an admin to approve
    version: 2,
    sql: `
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('seller','tailor','smm','admin'));
ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_role_check;
ALTER TABLE invites ADD CONSTRAINT invites_role_check CHECK (role IN ('seller','tailor','smm','admin'));

CREATE TABLE date_offers (
  id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES jobs(id),
  proposed_by INT NOT NULL REFERENCES users(id),
  old_date DATE NOT NULL,
  new_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','replaced')),
  decided_by INT REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX date_offers_job ON date_offers (job_id, status);
`,
  },
];

export async function migrate(sql = db()): Promise<number[]> {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(724501)`;
      const done = await tx`SELECT 1 FROM schema_migrations WHERE version = ${m.version}`;
      if (done.length) return;
      await tx.unsafe(m.sql);
      await tx`INSERT INTO schema_migrations (version) VALUES (${m.version})`;
      applied.push(m.version);
    });
  }
  return applied;
}

let migrated: Promise<unknown> | null = null;
/** Runs migrations once per warm function instance. */
export function ensureMigrated() {
  if (!migrated) {
    migrated = migrate().catch((e) => {
      migrated = null;
      throw e;
    });
  }
  return migrated;
}
