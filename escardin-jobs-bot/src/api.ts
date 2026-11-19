// The Mini App API (/api/app/*). Every request carries Telegram's signed initData; we check it,
// find the person in our users table, check permissions here on the server, then call src/actions.ts.
import { type Api, InputFile } from "grammy";
import * as act from "./actions";
import type {
  AppCheck,
  AppEvent,
  AppJob,
  AppPhoto,
  AppUser,
  InviteResponse,
  JobDetailResponse,
  JobFilter,
  JobsResponse,
  MeResponse,
  ReportItem,
  ReportResponse,
  TodayResponse,
} from "./app-types";
import { latestBackup } from "./backup";
import { cfg } from "./config";
import { t } from "./i18n";
import { describe, getBotUsername } from "./notify";
import * as repo from "./repo";
import type { EditField, Job, User } from "./repo";
import { CHECK_KEYS, type CheckKey, type CheckRow, ordered, progress } from "./rules/checks";
import {
  type Role,
  canCancelJob,
  canClaimDelivered,
  canClose,
  canCreateJob,
  canEditJob,
  canManage,
  canSetCheck,
} from "./rules/permissions";
import { buildReport } from "./rules/reminders";
import { todayTasks } from "./rules/today";
import { todayLocal } from "./time";
import { validateInitData } from "./webapp-auth";

export interface ApiContext {
  api: Api;
  botToken: string;
  /** Lets notifications finish after the answer was sent (Netlify context.waitUntil). */
  waitUntil?: (p: Promise<unknown>) => void;
  now?: Date;
}

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const APP_PAGE_SIZE = 20;
const FILTERS: JobFilter[] = ["m", "a", "t", "w", "o", "i", "u", "p"];

// ---------------- helpers ----------------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const STATUS: Record<act.ActionError, number> = {
  not_found: 404,
  forbidden: 403,
  self_forbidden: 403,
  job_not_open: 409,
  bad_value: 400,
  bad_input: 400,
  note_required: 400,
  photo_required: 400,
  amount_required: 400,
  incomplete: 400,
  reason_required: 400,
  no_issue: 400,
};

const failed = (f: act.Fail) => json({ error: f.error, missing: f.missing }, STATUS[f.error]);
const forbidden = () => json({ error: "forbidden" }, 403);
const notFound = () => json({ error: "not_found" }, 404);
const badInput = () => json({ error: "bad_input" }, 400);

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export const toAppUser = (u: User): AppUser => ({
  id: u.id,
  name: u.name,
  role: u.role,
  language: u.language,
  is_active: u.is_active,
  is_reachable: u.is_reachable,
});

const toAppCheck = (c: CheckRow): AppCheck => ({
  key: c.key,
  value: c.value,
  note: c.note,
  promised_date: c.promised_date,
  delivered_claimed: c.delivered_claimed,
  amount: c.amount,
  updated_by: c.updated_by,
  updated_by_name: c.updated_by_name ?? null,
  updated_at: iso(c.updated_at),
});

export const toAppJob = (j: Job, checks: CheckRow[]): AppJob => ({
  id: j.id,
  name: j.name,
  install_date: j.install_date,
  price: j.price,
  status: j.status,
  seller_id: j.seller_id,
  seller_name: j.seller_name,
  tailor_id: j.tailor_id,
  tailor_name: j.tailor_name,
  closed_at: iso(j.closed_at),
  closed_by_name: j.closed_by_name,
  closed_with_exception: j.closed_with_exception,
  exception_reason: j.exception_reason,
  checks: ordered(checks).map(toAppCheck),
});

async function body(req: Request): Promise<Record<string, any>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}

const id = (s: string | undefined) => (s && /^\d{1,9}$/.test(s) ? Number(s) : null);

/** Runs notifications after answering when the platform allows it, otherwise before. */
async function later(c: ApiContext, fn: () => Promise<void>) {
  const p = fn().catch((e) => console.error("app follow-up failed:", describe(e)));
  if (c.waitUntil) c.waitUntil(p);
  else await p;
}

// ---------------- sign-in ----------------

type Auth = { ok: true; me: User } | { ok: false; res: Response };

async function authenticate(req: Request, c: ApiContext): Promise<Auth> {
  const nowSec = Math.floor((c.now ?? new Date()).getTime() / 1000);
  const v = validateInitData(req.headers.get("x-telegram-init-data"), c.botToken, nowSec);
  if (!v.ok) return { ok: false, res: json({ error: "auth", reason: v.reason }, 401) };
  let me = await repo.userByTelegram(v.user.id);
  if (!me && cfg.adminIds().includes(v.user.id)) {
    // First admin opening the app before ever writing to the bot (same as /start in the chat)
    const name = act.cleanName([v.user.first_name, v.user.last_name].filter(Boolean).join(" ")) || `Admin ${v.user.id}`;
    me = await repo.createUser(v.user.id, name, "admin", cfg.defaultLang());
  }
  if (!me) return { ok: false, res: json({ error: "not_registered" }, 403) };
  if (!me.is_active) return { ok: false, res: json({ error: "deactivated" }, 403) };
  return { ok: true, me };
}

// ---------------- router ----------------

export async function handleApi(req: Request, c: ApiContext): Promise<Response> {
  try {
    const auth = await authenticate(req, c);
    if (!auth.ok) return auth.res;
    const me = auth.me;
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/api\/app\/?/, "").split("/").filter(Boolean);
    const method = req.method.toUpperCase();

    // A double tap (same request id twice) is done only once
    if (method === "POST") {
      const rid = req.headers.get("x-request-id");
      if (rid && /^[\w-]{8,64}$/.test(rid) && !(await repo.markRun("app_req", `${me.id}:${rid}`))) {
        return json({ error: "duplicate" }, 409);
      }
    }

    const [a, b, cc] = parts;
    const today = todayLocal(c.now);

    if (method === "GET" && a === "me") return json({ user: toAppUser(me), today } satisfies MeResponse);
    if (method === "POST" && a === "me" && b === "lang") return setLang(me, await body(req));
    if (method === "GET" && a === "today") return todayScreen(me, today);
    if (method === "GET" && a === "tailors") return tailors();
    if (method === "GET" && a === "jobs" && !b) return jobsList(me, url, today);
    if (method === "POST" && a === "jobs" && !b) return createJob(c, me, await body(req));
    if (a === "jobs" && b) {
      const jobId = id(b);
      if (jobId === null) return notFound();
      if (method === "GET" && !cc) return jobDetail(jobId);
      if (method === "POST" && cc === "check") return setCheck(req, c, me, jobId);
      if (method === "POST" && cc === "delivered") return delivered(c, me, jobId);
      if (method === "POST" && cc === "close") return closeJob(c, me, jobId, await body(req));
      if (method === "POST" && cc === "cancel") return cancelJob(c, me, jobId);
      if (method === "POST" && cc === "edit") return editJob(c, me, jobId, await body(req));
    }
    if (method === "GET" && a === "media" && b) return media(c, id(b));

    // Admin only
    if (["users", "invites", "report", "backup"].includes(a ?? "")) {
      if (!canManage(me)) return forbidden();
      if (method === "GET" && a === "users") return json({ users: (await repo.listUsers()).map(toAppUser) });
      if (method === "POST" && a === "users" && cc === "role") {
        const r = await act.setUserRole(me, id(b) ?? -1, (await body(req)).role);
        return r.ok ? json({ ok: true }) : failed(r);
      }
      if (method === "POST" && a === "users" && cc === "active") {
        const r = await act.setUserActive(me, id(b) ?? -1, (await body(req)).active === true);
        return r.ok ? json({ ok: true }) : failed(r);
      }
      if (method === "POST" && a === "invites") return createInvite(c, me, await body(req));
      if (method === "GET" && a === "report") return report(today);
      if (method === "POST" && a === "backup") return backup(c, me);
    }
    return notFound();
  } catch (e) {
    console.error("app api failed:", describe(e));
    return json({ error: "server" }, 500);
  }
}

// ---------------- screens ----------------

async function setLang(me: User, b: Record<string, any>) {
  if (b.lang !== "uz" && b.lang !== "en") return badInput();
  await repo.setUserLanguage(me.id, b.lang);
  return json({ ok: true });
}

async function todayScreen(me: User, today: string) {
  const [jobs, week] = await Promise.all([repo.openJobsWithChecks(), repo.weekStats(me.id, cfg.timezone())]);
  const tasks = todayTasks(me, jobs, today);
  const used = new Set(tasks.flatMap((x) => x.jobIds));
  const out: TodayResponse = {
    today,
    tasks,
    jobs: jobs.filter((j) => used.has(j.id)).map((j) => toAppJob(j, j.checks)),
    week,
  };
  return json(out);
}

async function tailors() {
  return json({ tailors: (await repo.activeUsers("tailor")).map((u) => ({ id: u.id, name: u.name })) });
}

async function jobsList(me: User, url: URL, today: string) {
  const f = url.searchParams.get("f") as JobFilter;
  const filter = FILTERS.includes(f) ? f : "a";
  const page = Math.max(0, Math.min(500, Number(url.searchParams.get("page")) || 0));
  const q = act.cleanName(url.searchParams.get("q") ?? "").slice(0, 50) || undefined;
  const { items, total } = await repo.listJobs(filter, me, today, page, q, APP_PAGE_SIZE);
  const out: JobsResponse = { items: items.map((j) => toAppJob(j, j.checks)), total, page, pageSize: APP_PAGE_SIZE };
  return json(out);
}

async function jobDetail(jobId: number) {
  const job = await repo.getJob(jobId);
  if (!job) return notFound();
  const [checks, photos, hist, users] = await Promise.all([
    repo.getChecks(jobId),
    repo.jobMedia(jobId),
    repo.history(jobId, 60),
    repo.listUsers(),
  ]);
  // Tailor changes are stored as user ids: show names
  const names = new Map(users.map((u) => [String(u.id), u.name]));
  const history: AppEvent[] = hist.events.map((e) => {
    const tailor = e.event_type === "edited_tailor_id";
    return {
      id: e.id,
      type: e.event_type,
      check_key: e.check_key,
      old_value: tailor ? (names.get(e.old_value ?? "") ?? e.old_value) : e.old_value,
      new_value: tailor ? (names.get(e.new_value ?? "") ?? e.new_value) : e.new_value,
      note: e.note,
      created_at: iso(e.created_at)!,
      user_name: e.user_name,
    };
  });
  const out: JobDetailResponse = {
    job: toAppJob(job, checks),
    photos: photos.map((p): AppPhoto => ({ id: p.id, caption: p.caption, created_at: iso(p.created_at)! })),
    history,
  };
  return json(out);
}

// ---------------- actions ----------------

async function createJob(c: ApiContext, me: User, b: Record<string, any>) {
  if (!canCreateJob(me)) return forbidden();
  const r = await act.createJob(c.api, me, {
    name: String(b.name ?? ""),
    install_date: String(b.install_date ?? ""),
    price: Number(b.price),
    tailor_id: Number(b.tailor_id),
  });
  if (!r.ok) return failed(r);
  await later(c, r.followUp);
  return json({ ok: true, id: r.id });
}

async function setCheck(req: Request, c: ApiContext, me: User, jobId: number) {
  const isForm = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
  let fields: Record<string, any> = {};
  let photo: File | null = null;
  if (isForm) {
    const form = await req.formData().catch(() => null);
    if (!form) return badInput();
    for (const [k, v] of form.entries()) {
      if (k === "photo" && typeof v !== "string") photo = v;
      else if (typeof v === "string") fields[k] = v;
    }
  } else fields = await body(req);

  const key = fields.key as CheckKey;
  const value = String(fields.value ?? "");
  if (!CHECK_KEYS.includes(key)) return badInput();

  // Permission first, so nothing is uploaded for a request that would be refused
  const job = await repo.getJob(jobId);
  if (!job) return notFound();
  if (job.status !== "open") return json({ error: "job_not_open" }, 409);
  if (!canSetCheck(me, job, key)) return forbidden();

  let photoFileId: string | null = null;
  if (photo) {
    if (photo.size > MAX_PHOTO_BYTES) return json({ error: "photo_too_big" }, 413);
    if (!/^image\//.test(photo.type)) return badInput();
    photoFileId = await uploadPhoto(c.api, me, photo);
  }

  const amount = fields.amount === undefined || fields.amount === null || fields.amount === "" ? null : Number(fields.amount);
  const r = await act.setCheck(c.api, me, jobId, key, value, {
    note: fields.note ? String(fields.note) : null,
    promisedDate: fields.promised_date ? String(fields.promised_date) : null,
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    photoFileId,
  });
  if (!r.ok) return failed(r);
  await later(c, r.followUp);
  return json({ ok: true, changed: r.changed });
}

/** Telegram stores photos for us: send it to the person's own bot chat, keep the file_id, delete the message. */
async function uploadPhoto(api: Api, me: User, photo: File): Promise<string> {
  const data = new Uint8Array(await photo.arrayBuffer());
  const msg = await api.sendPhoto(me.telegram_id, new InputFile(data, "photo.jpg"), { disable_notification: true });
  await api.deleteMessage(me.telegram_id, msg.message_id).catch(() => {});
  return msg.photo[msg.photo.length - 1].file_id;
}

async function delivered(c: ApiContext, me: User, jobId: number) {
  const job = await repo.getJob(jobId);
  if (!job) return notFound();
  if (!canClaimDelivered(me, job)) return job.status !== "open" ? json({ error: "job_not_open" }, 409) : forbidden();
  const r = await act.claimDelivered(c.api, me, jobId);
  if (!r.ok) return failed(r);
  await later(c, r.followUp);
  return json({ ok: true, changed: r.changed });
}

async function closeJob(c: ApiContext, me: User, jobId: number, b: Record<string, any>) {
  const job = await repo.getJob(jobId);
  if (!job) return notFound();
  const d = canClose(me, job, await repo.getChecks(jobId));
  if (!d.ok && d.reason === "forbidden") return forbidden();
  const r = await act.closeJob(c.api, me, jobId, typeof b.reason === "string" ? b.reason : null);
  if (!r.ok) return failed(r);
  await later(c, r.followUp);
  return json({ ok: true, exception: r.exception });
}

async function cancelJob(c: ApiContext, me: User, jobId: number) {
  const job = await repo.getJob(jobId);
  if (!job) return notFound();
  if (!canCancelJob(me, job)) return job.status !== "open" ? json({ error: "job_not_open" }, 409) : forbidden();
  const r = await act.cancelJob(c.api, me, jobId);
  if (!r.ok) return failed(r);
  await later(c, r.followUp);
  return json({ ok: true, changed: r.changed });
}

const EDIT_FIELDS: EditField[] = ["name", "install_date", "tailor_id", "price"];

async function editJob(c: ApiContext, me: User, jobId: number, b: Record<string, any>) {
  const job = await repo.getJob(jobId);
  if (!job) return notFound();
  if (!canEditJob(me, job)) return job.status !== "open" ? json({ error: "job_not_open" }, 409) : forbidden();
  const field = b.field as EditField;
  if (!EDIT_FIELDS.includes(field)) return badInput();
  const r = await act.editJob(c.api, me, jobId, field, field === "price" || field === "tailor_id" ? Number(b.value) : String(b.value ?? ""));
  if (!r.ok) return failed(r);
  await later(c, r.followUp);
  return json({ ok: true, changed: r.changed });
}

/** Photo through our server, so the bot token never reaches the phone. */
async function media(c: ApiContext, mediaId: number | null) {
  const fileId = mediaId === null ? null : await repo.mediaFileId(mediaId);
  if (!fileId) return notFound();
  try {
    const file = await c.api.getFile(fileId);
    if (!file.file_path) return notFound();
    const res = await fetch(`https://api.telegram.org/file/bot${c.botToken}/${file.file_path}`);
    if (!res.ok || !res.body) return notFound();
    return new Response(res.body, {
      headers: { "content-type": res.headers.get("content-type") || "image/jpeg", "cache-control": "private, max-age=86400" },
    });
  } catch (e) {
    console.error("media failed:", describe(e));
    return notFound();
  }
}

// ---------------- admin ----------------

async function createInvite(c: ApiContext, me: User, b: Record<string, any>) {
  const r = await act.createInvite(me, b.role as Role, String(b.name ?? ""));
  if (!r.ok) return failed(r);
  const username = await getBotUsername(c.api);
  const out: InviteResponse = { code: r.code, name: r.name, role: b.role, link: `https://t.me/${username}?start=inv_${r.code}` };
  return json(out);
}

async function report(today: string) {
  const jobs = await repo.openJobsWithChecks();
  const r = buildReport(jobs, today);
  const items = (list: typeof jobs): ReportItem[] =>
    list.map((j) => ({ id: j.id, name: j.name, install_date: j.install_date, progress: progress(j.checks) }));
  const out: ReportResponse = {
    today,
    open: r.open.length,
    debt: r.debt,
    sections: {
      attention: items(r.attention as typeof jobs),
      overdue: items(r.overdue as typeof jobs),
      materials: items(r.materials as typeof jobs),
      problems: items(r.problems as typeof jobs),
      unpaid: items(r.unpaid as typeof jobs),
      noVideo: items(r.noVideo as typeof jobs),
      noLabel: items(r.noLabel as typeof jobs),
    },
  };
  return json(out);
}

/** Sends the latest backup file to the admin's bot chat. */
async function backup(c: ApiContext, me: User) {
  const b = await latestBackup();
  if (b === "unavailable") return json({ error: "backup_unavailable" }, 409);
  if (!b) return json({ error: "backup_none" }, 404);
  await c.api.sendDocument(me.telegram_id, new InputFile(Buffer.from(b.data, "utf8"), b.key), {
    caption: t(me.language, "backup_caption", { key: b.key }),
  });
  return json({ ok: true });
}
