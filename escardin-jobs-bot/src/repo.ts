// All database reads and writes.
import { randomBytes } from "node:crypto";
import { db, type Sql } from "./db";
import { CHECK_KEYS, type CheckKey, type CheckRow, ordered } from "./rules/checks";
import {
  type Actor,
  type CheckInput,
  type CheckPlan,
  type ClaimPlan,
  type CloseDecision,
  type JobStatus,
  type Role,
  canClose,
  planCheckSet,
  planClaimDelivered,
} from "./rules/permissions";
import type { OpenJob } from "./rules/reminders";
import { addDays } from "./time";

export type Lang = "uz" | "en";

export interface User {
  id: number;
  telegram_id: number;
  name: string;
  role: Role;
  language: Lang;
  is_active: boolean;
  is_reachable: boolean;
}

export interface Job {
  id: number;
  name: string;
  install_date: string;
  price: number;
  seller_id: number;
  tailor_id: number;
  status: JobStatus;
  created_at: Date;
  closed_at: Date | null;
  closed_by: number | null;
  closed_with_exception: boolean;
  exception_reason: string | null;
  group_message_id: number | null;
  seller_name: string;
  tailor_name: string;
  closed_by_name: string | null;
}

// ---------------- Users ----------------

export async function userByTelegram(tgId: number): Promise<User | null> {
  const [u] = await db()<User[]>`SELECT * FROM users WHERE telegram_id = ${tgId}`;
  return u ?? null;
}

export async function userById(id: number): Promise<User | null> {
  const [u] = await db()<User[]>`SELECT * FROM users WHERE id = ${id}`;
  return u ?? null;
}

export async function listUsers(): Promise<User[]> {
  return db()<User[]>`SELECT * FROM users ORDER BY is_active DESC, role, name`;
}

export async function activeUsers(role?: Role): Promise<User[]> {
  return role
    ? db()<User[]>`SELECT * FROM users WHERE is_active AND role = ${role} ORDER BY name`
    : db()<User[]>`SELECT * FROM users WHERE is_active ORDER BY name`;
}

export async function createUser(tgId: number, name: string, role: Role, lang: Lang): Promise<User> {
  const [u] = await db()<User[]>`
    INSERT INTO users (telegram_id, name, role, language) VALUES (${tgId}, ${name}, ${role}, ${lang})
    RETURNING *`;
  return u;
}

export async function setUserRole(id: number, role: Role) {
  await db()`UPDATE users SET role = ${role} WHERE id = ${id}`;
}
export async function setUserActive(id: number, active: boolean) {
  await db()`UPDATE users SET is_active = ${active} WHERE id = ${id}`;
}
export async function setUserLanguage(id: number, lang: Lang) {
  await db()`UPDATE users SET language = ${lang} WHERE id = ${id}`;
}
export async function setUserReachable(id: number, reachable: boolean) {
  await db()`UPDATE users SET is_reachable = ${reachable} WHERE id = ${id}`;
  if (reachable) await db()`DELETE FROM notifications_sent WHERE kind = 'unreachable' AND user_id = ${id}`;
}

// ---------------- Invites ----------------

export async function createInvite(role: Role, name: string, createdBy: number): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  await db()`
    INSERT INTO invites (code, role, name, created_by, expires_at)
    VALUES (${code}, ${role}, ${name}, ${createdBy}, now() + interval '7 days')`;
  return code;
}

export type InviteResult = { ok: true; user: User } | { ok: false; reason: "invalid" | "registered" };

export async function useInvite(code: string, tgId: number, lang: Lang): Promise<InviteResult> {
  return db().begin(async (tx) => {
    const [inv] = await tx<{ role: Role; name: string }[]>`
      SELECT role, name FROM invites
      WHERE code = ${code.toUpperCase()} AND used_by IS NULL AND expires_at > now()
      FOR UPDATE`;
    if (!inv) return { ok: false, reason: "invalid" } as const;
    const [existing] = await tx<User[]>`SELECT * FROM users WHERE telegram_id = ${tgId}`;
    if (existing?.is_active) return { ok: false, reason: "registered" } as const;
    let user: User;
    if (existing) {
      // A deactivated person invited again: reactivate with the new role and name
      [user] = await tx<User[]>`
        UPDATE users SET role = ${inv.role}, name = ${inv.name}, is_active = true, is_reachable = true
        WHERE id = ${existing.id} RETURNING *`;
    } else {
      [user] = await tx<User[]>`
        INSERT INTO users (telegram_id, name, role, language) VALUES (${tgId}, ${inv.name}, ${inv.role}, ${lang})
        RETURNING *`;
    }
    await tx`UPDATE invites SET used_by = ${user.id} WHERE code = ${code.toUpperCase()}`;
    return { ok: true, user } as const;
  });
}

// ---------------- Conversation state ----------------

export interface UserState {
  state: string;
  data: Record<string, any>;
}

export async function getState(userId: number): Promise<UserState | null> {
  const [s] = await db()<UserState[]>`
    SELECT state, data FROM user_states WHERE user_id = ${userId} AND updated_at > now() - interval '1 day'`;
  return s ?? null;
}

export async function setState(userId: number, state: string, data: Record<string, any> = {}) {
  await db()`
    INSERT INTO user_states (user_id, state, data, updated_at) VALUES (${userId}, ${state}, ${db().json(data)}, now())
    ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, data = EXCLUDED.data, updated_at = now()`;
}

export async function clearState(userId: number) {
  await db()`DELETE FROM user_states WHERE user_id = ${userId}`;
}

/** Removes and returns the state in one step, so a double tap cannot use it twice. */
export async function takeState(userId: number, state: string): Promise<Record<string, any> | null> {
  const [s] = await db()<{ data: Record<string, any> }[]>`
    DELETE FROM user_states WHERE user_id = ${userId} AND state = ${state} RETURNING data`;
  return s?.data ?? null;
}

// ---------------- Updates, runs, notifications ----------------

/** True the first time an update id is seen. */
export async function markUpdate(updateId: number): Promise<boolean> {
  const r = await db()`INSERT INTO processed_updates (update_id) VALUES (${updateId}) ON CONFLICT DO NOTHING RETURNING 1`;
  return r.length > 0;
}

export async function hasRun(kind: string, key: string): Promise<boolean> {
  const r = await db()`SELECT 1 FROM scheduler_runs WHERE kind = ${kind} AND run_key = ${key}`;
  return r.length > 0;
}

/** Records a run; returns false if it was already recorded. */
export async function markRun(kind: string, key: string): Promise<boolean> {
  const r = await db()`
    INSERT INTO scheduler_runs (kind, run_key) VALUES (${kind}, ${key}) ON CONFLICT DO NOTHING RETURNING 1`;
  return r.length > 0;
}

/** Claims a notification slot. Returns false if it was already sent. */
export async function claimNotification(kind: string, jobId: number, userId: number, date: string): Promise<boolean> {
  const r = await db()`
    INSERT INTO notifications_sent (kind, job_id, user_id, sent_date) VALUES (${kind}, ${jobId}, ${userId}, ${date})
    ON CONFLICT DO NOTHING RETURNING 1`;
  return r.length > 0;
}

export async function releaseNotification(kind: string, jobId: number, userId: number, date: string) {
  await db()`
    DELETE FROM notifications_sent WHERE kind = ${kind} AND job_id = ${jobId} AND user_id = ${userId} AND sent_date = ${date}`;
}

export async function cleanupOld(today: string) {
  await db()`DELETE FROM processed_updates WHERE created_at < now() - interval '3 days'`;
  await db()`DELETE FROM user_states WHERE updated_at < now() - interval '2 days'`;
  await db()`DELETE FROM scheduler_runs WHERE kind = 'app_req' AND created_at < now() - interval '3 days'`;
  await db()`DELETE FROM notifications_sent WHERE kind <> 'unreachable' AND sent_date < ${addDays(today, -60)}`;
}

// ---------------- Jobs ----------------

const JOB_SELECT = (sql: Sql) => sql`
  SELECT j.*, s.name AS seller_name, t.name AS tailor_name, c.name AS closed_by_name
  FROM jobs j
  JOIN users s ON s.id = j.seller_id
  JOIN users t ON t.id = j.tailor_id
  LEFT JOIN users c ON c.id = j.closed_by`;

export async function getJob(id: number, sql: Sql = db()): Promise<Job | null> {
  const [j] = await sql<Job[]>`${JOB_SELECT(sql)} WHERE j.id = ${id}`;
  return j ?? null;
}

interface CheckDbRow extends Omit<CheckRow, "key"> {
  check_key: CheckKey;
  job_id: number;
}

const toCheck = (r: CheckDbRow): CheckRow => ({
  key: r.check_key,
  value: r.value,
  note: r.note,
  promised_date: r.promised_date,
  delivered_claimed: r.delivered_claimed,
  amount: r.amount,
  updated_by: r.updated_by,
  updated_at: r.updated_at,
  updated_by_name: r.updated_by_name ?? null,
});

export async function getChecks(jobId: number, sql: Sql = db()): Promise<CheckRow[]> {
  const rows = await sql<CheckDbRow[]>`
    SELECT c.*, u.name AS updated_by_name FROM job_checks c
    LEFT JOIN users u ON u.id = c.updated_by
    WHERE c.job_id = ${jobId}`;
  return ordered(rows.map(toCheck));
}

async function checksFor(jobIds: number[]): Promise<Map<number, CheckRow[]>> {
  const map = new Map<number, CheckRow[]>();
  if (!jobIds.length) return map;
  const rows = await db()<CheckDbRow[]>`
    SELECT c.*, u.name AS updated_by_name FROM job_checks c
    LEFT JOIN users u ON u.id = c.updated_by
    WHERE c.job_id IN ${db()(jobIds)}`;
  for (const id of jobIds) map.set(id, ordered(rows.filter((r) => r.job_id === id).map(toCheck)));
  return map;
}

export interface NewJob {
  name: string;
  install_date: string;
  price: number;
  seller_id: number;
  tailor_id: number;
}

export async function createJob(n: NewJob): Promise<number> {
  return db().begin(async (tx) => {
    const [j] = await tx<{ id: number }[]>`
      INSERT INTO jobs (name, install_date, price, seller_id, tailor_id)
      VALUES (${n.name}, ${n.install_date}, ${n.price}, ${n.seller_id}, ${n.tailor_id}) RETURNING id`;
    for (const k of CHECK_KEYS) await tx`INSERT INTO job_checks (job_id, check_key) VALUES (${j.id}, ${k})`;
    await tx`INSERT INTO job_events (job_id, user_id, event_type) VALUES (${j.id}, ${n.seller_id}, 'created')`;
    return j.id;
  });
}

export async function setGroupMessageId(jobId: number, messageId: number) {
  await db()`UPDATE jobs SET group_message_id = ${messageId} WHERE id = ${jobId} AND group_message_id IS NULL`;
}

export type ListFilter = "m" | "a" | "t" | "w" | "o" | "i" | "u" | "p";
export const FILTERS: ListFilter[] = ["m", "a", "t", "w", "o", "i", "u", "p"];
export const PAGE_SIZE = 6;

export interface ListItem extends Job {
  checks: CheckRow[];
}

export async function listJobs(
  filter: ListFilter,
  me: User,
  today: string,
  page: number,
  search?: string,
  pageSize = PAGE_SIZE,
): Promise<{ items: ListItem[]; total: number }> {
  const sql = db();
  const conds = [];
  if (search) {
    conds.push(sql`j.name ILIKE ${"%" + search.replace(/[%_\\]/g, (c) => "\\" + c) + "%"}`);
  } else {
    conds.push(sql`j.status = 'open'`);
    if (filter === "m") {
      conds.push(me.role === "tailor" ? sql`j.tailor_id = ${me.id}` : sql`j.seller_id = ${me.id}`);
    }
    if (filter === "t") conds.push(sql`j.install_date = ${today}`);
    if (filter === "w") conds.push(sql`j.install_date BETWEEN ${today} AND ${addDays(today, 6)}`);
    if (filter === "o") conds.push(sql`j.install_date < ${today}`);
    if (filter === "i") {
      conds.push(sql`EXISTS (SELECT 1 FROM job_checks c WHERE c.job_id = j.id AND c.check_key = 'materials'
        AND c.value IS NOT NULL AND c.value <> 'all_received')`);
    }
    if (filter === "u") {
      conds.push(sql`EXISTS (SELECT 1 FROM job_checks c WHERE c.job_id = j.id AND c.check_key = 'payment'
        AND (c.value IS NULL OR c.value <> 'paid'))`);
    }
    if (filter === "p") {
      conds.push(sql`EXISTS (SELECT 1 FROM job_checks c WHERE c.job_id = j.id AND c.check_key = 'quality'
        AND c.value = 'problem')`);
    }
  }
  const where = conds.reduce((a, c) => sql`${a} AND ${c}`);
  const [{ count }] = await sql<{ count: number }[]>`SELECT count(*) AS count FROM jobs j WHERE ${where}`;
  const order = search ? sql`ORDER BY (j.status = 'open') DESC, j.install_date, j.id` : sql`ORDER BY j.install_date, j.id`;
  const jobs = await sql<Job[]>`
    ${JOB_SELECT(sql)} WHERE ${where} ${order} LIMIT ${pageSize} OFFSET ${page * pageSize}`;
  const checks = await checksFor(jobs.map((j) => j.id));
  return { items: jobs.map((j) => ({ ...j, checks: checks.get(j.id) ?? ordered([]) })), total: count };
}

export async function openJobsWithChecks(): Promise<(OpenJob & Job)[]> {
  const sql = db();
  const jobs = await sql<Job[]>`${JOB_SELECT(sql)} WHERE j.status = 'open' ORDER BY j.install_date, j.id`;
  const checks = await checksFor(jobs.map((j) => j.id));
  return jobs.map((j) => ({ ...j, checks: checks.get(j.id) ?? ordered([]) }));
}

// ---------------- Changing a job (each in one transaction) ----------------

async function lockJob(tx: Sql, jobId: number) {
  await tx`SELECT id FROM jobs WHERE id = ${jobId} FOR UPDATE`;
  return getJob(jobId, tx);
}

async function addEvent(
  tx: Sql,
  e: { job: number; user: number; type: string; key?: string | null; old?: string | null; new?: string | null; note?: string | null },
) {
  await tx`
    INSERT INTO job_events (job_id, user_id, event_type, check_key, old_value, new_value, note)
    VALUES (${e.job}, ${e.user}, ${e.type}, ${e.key ?? null}, ${e.old ?? null}, ${e.new ?? null}, ${e.note ?? null})`;
}

export type CheckResult =
  | { found: false }
  | { found: true; job: Job; prev: CheckRow; plan: CheckPlan };

export async function setCheck(
  actor: Actor,
  jobId: number,
  key: CheckKey,
  value: string,
  input: CheckInput,
): Promise<CheckResult> {
  return db().begin(async (tx) => {
    const job = await lockJob(tx, jobId);
    if (!job) return { found: false } as const;
    const prev = (await getChecks(jobId, tx)).find((c) => c.key === key)!;
    const plan = planCheckSet(actor, job, prev, value, input);
    if (plan.ok && plan.changed) {
      const n = plan.next;
      await tx`
        UPDATE job_checks SET value = ${n.value}, note = ${n.note}, promised_date = ${n.promised_date},
          delivered_claimed = ${n.delivered_claimed}, amount = ${n.amount},
          updated_by = ${actor.id}, updated_at = now()
        WHERE job_id = ${jobId} AND check_key = ${key}`;
      const extra = [n.note, n.promised_date ? `promised ${n.promised_date}` : null, n.amount != null && key === "payment" ? `amount ${n.amount}` : null]
        .filter(Boolean)
        .join(" · ");
      await addEvent(tx, { job: jobId, user: actor.id, type: "check_set", key, old: prev.value, new: n.value, note: extra || null });
      if (input.photoFileId) {
        await tx`
          INSERT INTO job_media (job_id, kind, telegram_file_id, caption, uploaded_by)
          VALUES (${jobId}, 'photo', ${input.photoFileId}, ${n.note}, ${actor.id})`;
      }
    }
    return { found: true, job, prev, plan } as const;
  });
}

export async function claimDelivered(
  actor: Actor,
  jobId: number,
): Promise<{ found: false } | { found: true; job: Job; plan: ClaimPlan }> {
  return db().begin(async (tx) => {
    const job = await lockJob(tx, jobId);
    if (!job) return { found: false } as const;
    const materials = (await getChecks(jobId, tx))[0];
    const plan = planClaimDelivered(actor, job, materials);
    if (plan.ok && plan.changed) {
      await tx`UPDATE job_checks SET delivered_claimed = true WHERE job_id = ${jobId} AND check_key = 'materials'`;
      await addEvent(tx, { job: jobId, user: actor.id, type: "delivered_claimed", key: "materials" });
    }
    return { found: true, job, plan } as const;
  });
}

export async function closeJob(
  actor: Actor,
  jobId: number,
  exceptionReason: string | null,
): Promise<{ found: false } | { found: true; job: Job; decision: CloseDecision; closed: boolean }> {
  return db().begin(async (tx) => {
    const job = await lockJob(tx, jobId);
    if (!job) return { found: false } as const;
    const decision = canClose(actor, job, await getChecks(jobId, tx));
    if (!decision.ok || (decision.exception && !exceptionReason)) return { found: true, job, decision, closed: false } as const;
    await tx`
      UPDATE jobs SET status = 'done', closed_at = now(), closed_by = ${actor.id},
        closed_with_exception = ${decision.exception}, exception_reason = ${decision.exception ? exceptionReason : null}
      WHERE id = ${jobId}`;
    await addEvent(tx, {
      job: jobId,
      user: actor.id,
      type: decision.exception ? "closed_exception" : "closed",
      note: decision.exception ? exceptionReason : null,
    });
    return { found: true, job, decision, closed: true } as const;
  });
}

export async function cancelJob(actorId: number, jobId: number): Promise<boolean> {
  return db().begin(async (tx) => {
    const r = await tx`
      UPDATE jobs SET status = 'cancelled', closed_at = now(), closed_by = ${actorId}
      WHERE id = ${jobId} AND status = 'open' RETURNING id`;
    if (!r.length) return false;
    await addEvent(tx, { job: jobId, user: actorId, type: "cancelled" });
    return true;
  });
}

export type EditField = "name" | "install_date" | "tailor_id" | "price";

/** Returns the old value, or null when nothing changed. */
export async function editJob(actorId: number, jobId: number, field: EditField, value: string | number) {
  return db().begin(async (tx) => {
    const job = await lockJob(tx, jobId);
    if (!job || job.status !== "open") return null;
    const old = job[field];
    if (String(old) === String(value)) return null;
    if (field === "name") await tx`UPDATE jobs SET name = ${String(value)} WHERE id = ${jobId}`;
    if (field === "install_date") await tx`UPDATE jobs SET install_date = ${String(value)} WHERE id = ${jobId}`;
    if (field === "tailor_id") await tx`UPDATE jobs SET tailor_id = ${Number(value)} WHERE id = ${jobId}`;
    if (field === "price") await tx`UPDATE jobs SET price = ${Number(value)} WHERE id = ${jobId}`;
    await addEvent(tx, { job: jobId, user: actorId, type: `edited_${field}`, old: String(old), new: String(value) });
    return { job, old };
  });
}

export interface JobEvent {
  id: number;
  event_type: string;
  check_key: CheckKey | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: Date;
  user_name: string | null;
}

export async function history(jobId: number, limit: number | null): Promise<{ events: JobEvent[]; total: number }> {
  const sql = db();
  const [{ count }] = await sql<{ count: number }[]>`SELECT count(*) AS count FROM job_events WHERE job_id = ${jobId}`;
  const events = await sql<JobEvent[]>`
    SELECT e.*, u.name AS user_name FROM job_events e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.job_id = ${jobId} ORDER BY e.id DESC ${limit ? sql`LIMIT ${limit}` : sql``}`;
  return { events: events.reverse(), total: count };
}

export async function jobPhotos(jobId: number): Promise<{ telegram_file_id: string; caption: string | null }[]> {
  return db()`
    SELECT telegram_file_id, caption FROM job_media WHERE job_id = ${jobId} AND kind = 'photo' ORDER BY id DESC LIMIT 10`;
}

export interface MediaItem {
  id: number;
  caption: string | null;
  created_at: Date;
}

export async function jobMedia(jobId: number): Promise<MediaItem[]> {
  return db()<MediaItem[]>`
    SELECT id, caption, created_at FROM job_media WHERE job_id = ${jobId} AND kind = 'photo' ORDER BY id DESC LIMIT 30`;
}

export async function mediaFileId(id: number): Promise<string | null> {
  const [m] = await db()<{ telegram_file_id: string }[]>`SELECT telegram_file_id FROM job_media WHERE id = ${id}`;
  return m?.telegram_file_id ?? null;
}

/** Jobs I finished in the last 7 days, and how many of them were closed by the install date. */
export async function weekStats(userId: number, tz: string): Promise<{ done: number; onTime: number }> {
  const [r] = await db()<{ done: number; on_time: number }[]>`
    SELECT count(*)::int AS done,
      count(*) FILTER (WHERE (closed_at AT TIME ZONE ${tz})::date <= install_date)::int AS on_time
    FROM jobs
    WHERE status = 'done' AND closed_at > now() - interval '7 days'
      AND (seller_id = ${userId} OR tailor_id = ${userId} OR closed_by = ${userId})`;
  return { done: r?.done ?? 0, onTime: r?.on_time ?? 0 };
}

export async function countPhotos(jobId: number): Promise<number> {
  const [{ count }] = await db()<{ count: number }[]>`
    SELECT count(*) AS count FROM job_media WHERE job_id = ${jobId} AND kind = 'photo'`;
  return count;
}
