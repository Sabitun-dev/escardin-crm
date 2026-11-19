// Everything that changes a job or a user, shared by the chat bot (src/bot.ts) and the Mini App API (src/api.ts).
// Each action checks permissions on the server, saves (in one transaction in repo.ts) and returns a result.
// Notifications and group posts are in `followUp`, so the caller can show the result first and send them after.
import { type Api, InlineKeyboard } from "grammy";
import { cfg } from "./config";
import { type Lang, esc, money, t } from "./i18n";
import { audienceUsers, notifyMany, postToGroup } from "./notify";
import * as repo from "./repo";
import type { EditField, Job, User } from "./repo";
import { CHECKS, type CheckKey } from "./rules/checks";
import { type CheckInput, type Role, canCancelJob, canCreateJob, canEditJob, canManage } from "./rules/permissions";
import { fmtDate } from "./time";
import * as v from "./views";

export type ActionError =
  | "not_found"
  | "forbidden"
  | "job_not_open"
  | "bad_value"
  | "bad_input"
  | "note_required"
  | "photo_required"
  | "amount_required"
  | "incomplete"
  | "reason_required"
  | "no_issue"
  | "self_forbidden";

export type Fail = { ok: false; error: ActionError; missing?: CheckKey[] };
type FollowUp = { followUp: () => Promise<void> };
export type Result<T = object> = ({ ok: true } & T) | Fail;

const fail = (error: ActionError, missing?: CheckKey[]): Fail => ({ ok: false, error, missing });
const nothing = async () => {};
const glang = () => cfg.defaultLang();
const who = (me: User) => esc(me.name);

export const cleanName = (s: string) => s.replace(/\s+/g, " ").trim();
const isIsoDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const isMoney = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 1e13;

async function activeTailor(id: number) {
  const tl = Number.isInteger(id) ? await repo.userById(id) : null;
  return tl && tl.role === "tailor" && tl.is_active ? tl : null;
}

// ---------------- new job ----------------

export interface NewJobInput {
  name: string;
  install_date: string;
  price: number;
  tailor_id: number;
}

export async function createJob(api: Api, me: User, n: NewJobInput): Promise<Result<{ id: number } & FollowUp>> {
  if (!canCreateJob(me)) return fail("forbidden");
  const name = cleanName(String(n.name ?? ""));
  if (name.length < 1 || name.length > 100 || !isIsoDate(n.install_date) || !isMoney(n.price)) return fail("bad_input");
  if (!(await activeTailor(n.tailor_id))) return fail("bad_input");
  const id = await repo.createJob({ name, install_date: n.install_date, price: n.price, seller_id: me.id, tailor_id: n.tailor_id });

  const followUp = async () => {
    const job = await repo.getJob(id);
    if (!job) return;
    const p = (lang: Lang) => ({
      name: esc(job.name),
      date: fmtDate(job.install_date),
      tailor: esc(job.tailor_name),
      seller: esc(job.seller_name),
      price: money(lang, job.price),
    });
    await postToGroup(api, job, t(glang(), "g_new_job", p(glang())));
    await notifyMany(api, await repo.activeUsers(), (lang) => ({ text: t(lang, "notif_new_job", p(lang)), kb: v.openKb(lang, id) }), me.id);
  };
  return { ok: true, id, followUp };
}

// ---------------- checks ----------------

export async function setCheck(
  api: Api,
  me: User,
  jobId: number,
  key: CheckKey,
  value: string,
  input: CheckInput,
): Promise<Result<{ changed: boolean; job: Job } & FollowUp>> {
  if (!CHECKS[key]) return fail("bad_value");
  if (input.note && input.note.trim().length > 500) return fail("bad_input");
  if (input.promisedDate && !isIsoDate(input.promisedDate)) return fail("bad_input");
  const r = await repo.setCheck(me, jobId, key, value, input);
  if (!r.found) return fail("not_found");
  const plan = r.plan;
  if (!plan.ok) return fail(plan.error === "not_open" ? "job_not_open" : plan.error);
  const job = r.job;
  if (!plan.changed) return { ok: true, changed: false, job, followUp: nothing };

  const followUp = async () => {
    const n = plan.next;
    const gl = glang();
    const lines = [
      t(gl, "g_check", {
        name: esc(job.name),
        icon: v.icon({ key, value: n.value }),
        n: v.checkNum(key),
        check: v.checkName(gl, key),
        value: v.valueName(gl, key, n.value),
        who: who(me),
      }),
    ];
    if (n.note) lines.push(t(gl, "note_line", { note: esc(n.note) }));
    if (n.promised_date) lines.push(t(gl, "promised_line", { date: fmtDate(n.promised_date) }));
    if (key === "payment") {
      const paid = n.amount ?? 0;
      lines.push(t(gl, "paid_line", { paid: money(gl, paid), price: money(gl, job.price), rest: money(gl, Math.max(0, job.price - paid)) }));
    }
    await postToGroup(api, job, lines.join("\n"), input.photoFileId);

    // People who must know (materials issue, problem)
    if (!plan.notify.length) return;
    await notifyMany(
      api,
      await audienceUsers(job, plan.notify),
      (lang) => {
        const text =
          key === "materials"
            ? t(lang, "n_materials", {
                name: esc(job.name),
                issue: v.valueName(lang, key, n.value),
                note: esc(n.note ?? ""),
                promised: n.promised_date ? t(lang, "n_promised_part", { date: fmtDate(n.promised_date) }) : "",
                tailor: esc(job.tailor_name),
              })
            : t(lang, "n_problem", { name: esc(job.name), note: esc(n.note ?? ""), tailor: esc(job.tailor_name) });
        return { text, kb: v.openKb(lang, job.id), photo: input.photoFileId };
      },
      me.id,
    );
  };
  return { ok: true, changed: true, job, followUp };
}

/** Seller: "I delivered the rest" of the materials. */
export async function claimDelivered(api: Api, me: User, jobId: number): Promise<Result<{ changed: boolean } & FollowUp>> {
  const r = await repo.claimDelivered(me, jobId);
  if (!r.found) return fail("not_found");
  const plan = r.plan;
  if (!plan.ok) return fail(plan.error === "not_open" ? "job_not_open" : plan.error);
  if (!plan.changed) return { ok: true, changed: false, followUp: nothing };
  const job = r.job;
  const followUp = async () => {
    await postToGroup(api, job, t(glang(), "g_delivered", { name: esc(job.name), who: who(me) }));
    await notifyMany(
      api,
      await audienceUsers(job, plan.notify),
      (lang) => ({
        text: t(lang, "n_delivered", { seller: who(me), name: esc(job.name) }),
        kb: v.openKb(lang, job.id, new InlineKeyboard().text(t(lang, "btn_all_received"), `s:${job.id}:m:0`)),
      }),
      me.id,
    );
  };
  return { ok: true, changed: true, followUp };
}

// ---------------- close / cancel ----------------

/** Normal close (reason = null) or, for admins below 6/6, an exception close with a reason. */
export async function closeJob(api: Api, me: User, jobId: number, reason: string | null): Promise<Result<{ exception: boolean } & FollowUp>> {
  const why = reason?.trim() ? reason.trim().slice(0, 500) : null;
  if (why !== null && why.length < 3) return fail("reason_required");
  const r = await repo.closeJob(me, jobId, why);
  if (!r.found) return fail("not_found");
  const d = r.decision;
  if (!r.closed) {
    if (!d.ok) return fail(d.reason === "not_open" ? "job_not_open" : d.reason, d.missing);
    return fail("reason_required", d.missing);
  }
  const job = r.job;
  const exception = d.ok && d.exception;
  const followUp = async () => {
    const gl = glang();
    if (exception) {
      await postToGroup(api, job, t(gl, "g_closed_exc", { name: esc(job.name), who: who(me), reason: esc(why) }));
      await notifyMany(
        api,
        await repo.activeUsers("admin"),
        (lang) => ({
          text: t(lang, "n_closed_exc", { name: esc(job.name), by: who(me), reason: esc(why), list: v.missingList(lang, d.missing) }),
          kb: v.openKb(lang, job.id),
        }),
        me.id,
      );
    } else {
      await postToGroup(api, job, t(gl, "g_closed", { name: esc(job.name), who: who(me) }));
      await notifyMany(
        api,
        await audienceUsers(job, ["seller", "tailor", "admins"]),
        (lang) => ({ text: t(lang, "n_closed", { name: esc(job.name), by: who(me) }), kb: v.openKb(lang, job.id) }),
        me.id,
      );
    }
  };
  return { ok: true, exception, followUp };
}

export async function cancelJob(api: Api, me: User, jobId: number): Promise<Result<{ changed: boolean } & FollowUp>> {
  const job = await repo.getJob(jobId);
  if (!job) return fail("not_found");
  if (!canCancelJob(me, job)) return fail(job.status !== "open" ? "job_not_open" : "forbidden");
  if (!(await repo.cancelJob(me.id, jobId))) return { ok: true, changed: false, followUp: nothing };
  const followUp = () => postToGroup(api, job, t(glang(), "g_cancelled", { name: esc(job.name), who: who(me) }));
  return { ok: true, changed: true, followUp };
}

// ---------------- edit ----------------

export async function editJob(
  api: Api,
  me: User,
  jobId: number,
  field: EditField,
  raw: string | number,
): Promise<Result<{ changed: boolean } & FollowUp>> {
  const job = await repo.getJob(jobId);
  if (!job) return fail("not_found");
  if (!canEditJob(me, job)) return fail(job.status !== "open" ? "job_not_open" : "forbidden");

  let value: string | number;
  if (field === "name") {
    value = cleanName(String(raw));
    if (value.length < 1 || value.length > 100) return fail("bad_input");
  } else if (field === "install_date") {
    if (!isIsoDate(raw)) return fail("bad_input");
    value = raw;
  } else if (field === "price") {
    if (!isMoney(raw)) return fail("bad_input");
    value = raw;
  } else if (field === "tailor_id") {
    if (!(await activeTailor(Number(raw)))) return fail("bad_input");
    value = Number(raw);
  } else return fail("bad_input");

  const r = await repo.editJob(me.id, jobId, field, value);
  if (!r) return { ok: true, changed: false, followUp: nothing };

  const followUp = async () => {
    const fresh = await repo.getJob(jobId);
    if (!fresh) return;
    const gl = glang();
    const fmt = (lang: Lang, x: string | number) =>
      field === "install_date" ? fmtDate(String(x)) : field === "price" ? money(lang, Number(x)) : esc(String(x));
    const oldVal = field === "tailor_id" ? job.tailor_name : r.old;
    const newVal = field === "tailor_id" ? fresh.tailor_name : value;
    await postToGroup(
      api,
      fresh,
      t(gl, "g_edit", { name: esc(fresh.name), field: v.fieldName(gl, field), old: fmt(gl, oldVal), new: fmt(gl, newVal), who: who(me) }),
    );

    if (field === "tailor_id") {
      const users = [
        ...(await audienceUsers({ seller_id: job.seller_id, tailor_id: job.tailor_id }, ["tailor"])),
        ...(await audienceUsers(fresh, ["tailor", "admins"])),
      ];
      await notifyMany(
        api,
        users,
        (lang) => ({
          text: t(lang, "n_tailor_changed", { name: esc(fresh.name), old: esc(job.tailor_name), new: esc(fresh.tailor_name), by: who(me) }),
          kb: v.openKb(lang, jobId),
        }),
        me.id,
      );
    }
    if (field === "install_date") {
      await notifyMany(
        api,
        await audienceUsers(fresh, ["tailor", "admins"]),
        (lang) => ({
          text: t(lang, "n_date_changed", { name: esc(fresh.name), old: fmtDate(job.install_date), new: fmtDate(fresh.install_date), by: who(me) }),
          kb: v.openKb(lang, jobId),
        }),
        me.id,
      );
    }
  };
  return { ok: true, changed: true, followUp };
}

// ---------------- users and invites (admin) ----------------

export async function createInvite(me: User, role: Role, rawName: string): Promise<Result<{ code: string; name: string }>> {
  if (!canManage(me)) return fail("forbidden");
  const name = cleanName(String(rawName ?? ""));
  if (!["seller", "tailor", "admin"].includes(role) || name.length < 1 || name.length > 60) return fail("bad_input");
  return { ok: true, code: await repo.createInvite(role, name, me.id), name };
}

export async function setUserRole(me: User, userId: number, role: Role): Promise<Result> {
  if (!canManage(me)) return fail("forbidden");
  if (!["seller", "tailor", "admin"].includes(role)) return fail("bad_input");
  if (userId === me.id) return fail("self_forbidden");
  if (!(await repo.userById(userId))) return fail("not_found");
  await repo.setUserRole(userId, role);
  return { ok: true };
}

export async function setUserActive(me: User, userId: number, active: boolean): Promise<Result> {
  if (!canManage(me)) return fail("forbidden");
  if (userId === me.id) return fail("self_forbidden");
  if (!(await repo.userById(userId))) return fail("not_found");
  await repo.setUserActive(userId, active);
  return { ok: true };
}
