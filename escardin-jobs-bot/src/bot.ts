// The Telegram bot: registration, menus, jobs, checks, admin tools.
import { Bot, type Context, GrammyError, InlineKeyboard, InputFile } from "grammy";
import * as act from "./actions";
import { latestBackup } from "./backup";
import { cfg } from "./config";
import { type Lang, esc, money, t } from "./i18n";
import { alertAdmins, describe, markUnreachable, setBotUsername } from "./notify";
import * as repo from "./repo";
import type { EditField, Job, ListFilter, User } from "./repo";
import { CHECKS, type CheckKey, keyFromShort, needsAmount, needsNote, parseMoney, validPartlyAmount } from "./rules/checks";
import {
  type CheckInput,
  canCancelJob,
  canClose,
  canCreateJob,
  canEditJob,
  canManage,
  canProposeDate,
  canSetCheck,
  isAdmin,
} from "./rules/permissions";
import { reportFor } from "./scheduler";
import { addDays, diffDays, fmtDate, packDate, parseUserDate, todayLocal, unpackDate } from "./time";
import * as v from "./views";

interface MyContext extends Context {
  u: User;
  lang: Lang;
  answered?: boolean;
}

type Ctx = MyContext;
const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

// ---------------- helpers ----------------

const tr = (ctx: Ctx, key: Parameters<typeof t>[1], params?: Record<string, string | number>) => t(ctx.lang, key, params);

async function toast(ctx: Ctx, text: string, alert = false) {
  if (ctx.callbackQuery && !ctx.answered) {
    ctx.answered = true;
    await ctx.answerCallbackQuery({ text: text.slice(0, 190), show_alert: alert }).catch(() => {});
  } else if (!ctx.callbackQuery && alert) {
    await ctx.reply(text, HTML);
  }
}

const notModified = (e: unknown) => e instanceof GrammyError && /not modified/i.test(e.description);

/** Shows a screen: edits the tapped message in place, or sends a new one after typed input. */
async function show(ctx: Ctx, view: v.View): Promise<number | undefined> {
  const msg = ctx.callbackQuery?.message;
  if (msg && "text" in msg) {
    try {
      await ctx.editMessageText(view.text, { ...HTML, reply_markup: view.kb });
      return msg.message_id;
    } catch (e) {
      if (notModified(e)) return msg.message_id;
    }
  }
  const sent = await ctx.reply(view.text, { ...HTML, reply_markup: view.kb });
  return sent.message_id;
}

/** Asks the user to type something; remembers the question so it can be tidied away. */
async function prompt(ctx: Ctx, state: string, data: Record<string, any>, text: string, kb = new InlineKeyboard()) {
  kb.row().text(tr(ctx, "btn_cancel"), "x");
  const old = (await repo.getState(ctx.u.id))?.data?.pmid;
  if (old && !ctx.callbackQuery) await deleteMsg(ctx, old);
  const pmid = await show(ctx, { text, kb });
  await repo.setState(ctx.u.id, state, { ...data, pmid });
}

async function deleteMsg(ctx: Ctx, id: number | undefined) {
  if (!id || !ctx.chat) return;
  await ctx.api.deleteMessage(ctx.chat.id, id).catch(() => {});
}

/** Removes the question message after the user answered by typing. */
async function tidy(ctx: Ctx, data: Record<string, any> | null) {
  if (!ctx.callbackQuery) await deleteMsg(ctx, data?.pmid);
}

const today = () => todayLocal();
const num = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : NaN);
const name1 = (s: string) => s.replace(/\s+/g, " ").trim();

async function loadJob(ctx: Ctx, id: number): Promise<Job | null> {
  const job = Number.isFinite(id) ? await repo.getJob(id) : null;
  if (!job) await toast(ctx, tr(ctx, "not_found"), true);
  return job;
}

async function showMenu(ctx: Ctx) {
  await show(ctx, v.mainMenu(ctx.lang, ctx.u));
}

async function showCard(ctx: Ctx, jobId: number) {
  const job = await repo.getJob(jobId);
  if (!job) return toast(ctx, tr(ctx, "not_found"), true);
  const [checks, photos, offer] = await Promise.all([repo.getChecks(jobId), repo.countPhotos(jobId), repo.pendingOffer(jobId)]);
  await show(ctx, v.cardView(ctx.lang, ctx.u, job, checks, today(), photos, offer));
}

async function showList(ctx: Ctx, filter: ListFilter, page: number, search?: string) {
  const { items, total } = await repo.listJobs(filter, ctx.u, today(), Math.max(0, page), search);
  await show(ctx, v.listView(ctx.lang, items, total, filter, Math.max(0, page), today(), search));
}

const who = (ctx: Ctx) => esc(ctx.u.name);
const glang = () => cfg.defaultLang();

/** Text for an action that did not go through. */
function failText(ctx: Ctx, f: act.Fail): string {
  if (f.error === "incomplete" || f.error === "reason_required") {
    return tr(ctx, "close_missing", { list: v.missingList(ctx.lang, f.missing ?? []) });
  }
  const same = ["not_found", "forbidden", "job_not_open", "photo_required", "no_issue", "self_forbidden", "already_decided"] as const;
  return tr(ctx, (same as readonly string[]).includes(f.error) ? (f.error as (typeof same)[number]) : "expired");
}

// ---------------- bot ----------------

let instance: Bot<MyContext> | null = null;

export function getBot(): Bot<MyContext> {
  if (instance) return instance;
  const bot = new Bot<MyContext>(cfg.botToken());
  instance = bot;

  // Errors: log, tell admins, never crash or make Telegram resend
  bot.use(async (ctx, next) => {
    try {
      await next();
    } catch (e) {
      console.error("handler error:", describe(e), e instanceof Error ? describe(e.stack) : "");
      await alertAdmins(ctx.api, e);
      try {
        if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: t(ctx.lang ?? glang(), "error_generic"), show_alert: true });
        else if (ctx.chat?.type === "private") await ctx.reply(t(ctx.lang ?? glang(), "error_generic"));
      } catch {}
    } finally {
      if (ctx.callbackQuery && !ctx.answered) await ctx.answerCallbackQuery().catch(() => {});
    }
  });

  // Each Telegram update is handled once, even if Telegram sends it again
  bot.use(async (ctx, next) => {
    if (!(await repo.markUpdate(ctx.update.update_id))) return;
    if (ctx.me?.username) setBotUsername(ctx.me.username);
    await next();
  });

  // Group chats: the bot only posts there; /groupid tells the group's id
  bot.use(async (ctx, next) => {
    if (!ctx.chat || ctx.chat.type === "private") return next();
    const text = ctx.message?.text ?? "";
    if (/^\/groupid(@\w+)?\b/.test(text)) await ctx.reply(t(glang(), "group_id", { id: ctx.chat.id }), HTML);
  });

  // Someone blocked or unblocked the bot
  bot.on("my_chat_member", async (ctx) => {
    const u = await repo.userByTelegram(ctx.from.id);
    if (!u) return;
    const status = ctx.myChatMember.new_chat_member.status;
    if (status === "kicked") {
      await markUnreachable(ctx.api, u);
    } else if (status === "member") await repo.setUserReachable(u.id, true);
  });

  // Registration and access control
  bot.use(async (ctx, next) => {
    const from = ctx.from;
    if (!from || from.is_bot) return;
    ctx.lang = glang();
    let u = await repo.userByTelegram(from.id);
    const text = ctx.message?.text ?? "";
    const invite = /^\/start(?:@\w+)?\s+(?:inv_)?([A-Za-z0-9]{6,12})\s*$/.exec(text);

    if (!u || !u.is_active) {
      if (invite && !/^j\d+$/.test(invite[1])) {
        const r = await repo.useInvite(invite[1], from.id, glang());
        if (!r.ok) {
          await ctx.reply(t(glang(), r.reason === "registered" ? "already_registered" : "invite_invalid"), HTML);
          return;
        }
        ctx.u = r.user;
        ctx.lang = r.user.language;
        await ctx.reply(tr(ctx, "welcome", { name: esc(r.user.name), role: v.roleName(ctx.lang, r.user.role) }), HTML);
        return showMenu(ctx);
      }
      if (!u && cfg.adminIds().includes(from.id)) {
        const name = name1([from.first_name, from.last_name].filter(Boolean).join(" ")) || `Admin ${from.id}`;
        u = await repo.createUser(from.id, name, "admin", glang());
      } else {
        const key = u ? "deactivated" : "not_registered";
        if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: t(glang(), key).replace(/<[^>]+>/g, ""), show_alert: true });
        else await ctx.reply(t(glang(), key), HTML);
        ctx.answered = true;
        return;
      }
    }
    if (!u.is_reachable) await repo.setUserReachable(u.id, true);
    ctx.u = u;
    ctx.lang = u.language;
    await next();
  });

  // ---------------- commands ----------------

  bot.command("start", async (ctx) => {
    const payload = ctx.match.trim();
    await repo.clearState(ctx.u.id);
    const job = /^j(\d+)$/.exec(payload);
    if (job) return showCard(ctx, Number(job[1]));
    if (payload) await ctx.reply(tr(ctx, "already_registered"));
    await showMenu(ctx);
  });

  bot.command("menu", async (ctx) => {
    await repo.clearState(ctx.u.id);
    await showMenu(ctx);
  });

  bot.command("help", async (ctx) => show(ctx, v.helpView(ctx.lang)));

  bot.command("backup", async (ctx) => sendBackup(ctx));

  // ---------------- buttons ----------------

  bot.on("callback_query:data", async (ctx) => {
    const [cmd, a, b, c] = ctx.callbackQuery.data.split(":");
    switch (cmd) {
      case "m":
        await repo.clearState(ctx.u.id);
        return showMenu(ctx);
      case "help":
        return show(ctx, v.helpView(ctx.lang));
      case "lang":
        if (a === "uz" || a === "en") {
          await repo.setUserLanguage(ctx.u.id, a);
          ctx.u.language = a;
          ctx.lang = a;
          await toast(ctx, tr(ctx, "lang_set"));
        }
        return showMenu(ctx);
      case "x":
        await repo.clearState(ctx.u.id);
        await toast(ctx, tr(ctx, "input_cancelled"));
        return showMenu(ctx);

      // new job
      case "nj":
        if (!canCreateJob(ctx.u)) return toast(ctx, tr(ctx, "forbidden"), true);
        return prompt(ctx, "nj_name", {}, tr(ctx, "nj_ask_name"));
      case "nd":
        return newJobDate(ctx, addDays(today(), num(a) || 1), false);
      case "ndy": {
        const d = unpackDate(a ?? "");
        return d ? newJobDate(ctx, d, true) : toast(ctx, tr(ctx, "expired"), true);
      }
      case "ndb": {
        const s = await repo.getState(ctx.u.id);
        if (s?.state !== "nj_date") return toast(ctx, tr(ctx, "expired"), true);
        return askNewJobDate(ctx, s.data);
      }
      case "nt":
        return newJobTailor(ctx, num(a));
      case "nc":
        return newJobConfirm(ctx);
      case "nx":
        await repo.clearState(ctx.u.id);
        await toast(ctx, tr(ctx, "nj_cancelled"));
        return showMenu(ctx);

      // lists
      case "l":
        return showList(ctx, (repo.FILTERS.includes(a as ListFilter) ? a : "a") as ListFilter, num(b) || 0);
      case "ls":
        return prompt(ctx, "search", {}, tr(ctx, "ask_search"));
      case "lq": {
        const s = await repo.getState(ctx.u.id);
        if (s?.state !== "search_done") return toast(ctx, tr(ctx, "expired"), true);
        return showList(ctx, "a", num(a) || 0, s.data.q);
      }

      // job card and checks
      case "j":
        await repo.clearState(ctx.u.id);
        return showCard(ctx, num(a));
      case "c":
        return openPicker(ctx, num(a), keyFromShort(b ?? ""));
      case "s":
        return pickValue(ctx, num(a), keyFromShort(b ?? ""), num(c));
      case "pd":
        return promisedChosen(ctx, num(a));
      case "dl":
        return claimDelivered(ctx, num(a));
      case "h":
      case "ha":
        return showHistory(ctx, num(a), cmd === "ha");
      case "ph":
        return sendPhotos(ctx, num(a));

      // new install date: tailor suggests, admin decides
      case "do":
        return offerAsk(ctx, num(a));
      case "dod":
        return offerDate(ctx, num(a), addDays(today(), num(b) || 1));
      case "oa":
      case "or":
        return offerDecide(ctx, num(a), cmd === "oa");

      // closing and cancelling
      case "cl":
        return closeAsk(ctx, num(a));
      case "cly":
        return closeDo(ctx, num(a), null);
      case "ce":
        return exceptionAsk(ctx, num(a));
      case "cx":
        return cancelAsk(ctx, num(a));
      case "cxy":
        return cancelDo(ctx, num(a));

      // editing
      case "e":
        return editMenu(ctx, num(a));
      case "en":
      case "ed":
      case "et":
      case "ep":
        return editAsk(ctx, num(a), cmd);
      case "edd":
        return editDate(ctx, num(a), addDays(today(), num(b) || 1), false);
      case "edy": {
        const d = unpackDate(b ?? "");
        return d ? editDate(ctx, num(a), d, true) : toast(ctx, tr(ctx, "expired"), true);
      }
      case "ett":
        return editApply(ctx, num(a), "tailor_id", num(b));

      // admin
      case "u":
        return usersScreen(ctx);
      case "uu":
        return userScreen(ctx, num(a));
      case "ur":
        return userRole(ctx, num(a), b ?? "");
      case "ua":
        return userToggle(ctx, num(a));
      case "ui":
        if (!canManage(ctx.u)) return toast(ctx, tr(ctx, "forbidden"), true);
        return show(ctx, {
          text: tr(ctx, "invite_role"),
          kb: new InlineKeyboard()
            .text(v.roleName(ctx.lang, "seller"), "uir:s")
            .text(v.roleName(ctx.lang, "tailor"), "uir:t")
            .row()
            .text(v.roleName(ctx.lang, "smm"), "uir:m")
            .text(v.roleName(ctx.lang, "admin"), "uir:a")
            .row()
            .text(tr(ctx, "btn_back"), "u"),
        });
      case "uir": {
        const role = v.roleFromLetter(a ?? "");
        if (!canManage(ctx.u) || !role) return toast(ctx, tr(ctx, "forbidden"), true);
        return prompt(ctx, "inv_name", { role }, tr(ctx, "invite_name"));
      }
      case "r":
        return reportScreen(ctx);
      case "bk":
        return sendBackup(ctx);
      default:
        return toast(ctx, tr(ctx, "expired"));
    }
  });

  // ---------------- typed text ----------------

  bot.on("message:text", async (ctx) => {
    const s = await repo.getState(ctx.u.id);
    const text = ctx.message.text.trim();
    if (!s) return ctx.reply(tr(ctx, "unknown_input"), { reply_markup: new InlineKeyboard().text(tr(ctx, "btn_menu"), "m") });
    const d = s.data;
    switch (s.state) {
      case "nj_name": {
        const n = name1(text);
        if (n.length < 1 || n.length > 100) return ctx.reply(tr(ctx, "name_invalid"));
        await tidy(ctx, d);
        return askNewJobDate(ctx, { name: n });
      }
      case "nj_date": {
        const date = parseUserDate(text, today());
        if (!date) return ctx.reply(tr(ctx, "date_invalid"));
        await tidy(ctx, d);
        return newJobDate(ctx, date, false);
      }
      case "nj_price": {
        const p = parseMoney(text);
        if (p === null) return ctx.reply(tr(ctx, "price_invalid"));
        await tidy(ctx, d);
        return newJobSummary(ctx, { ...d, price: p });
      }
      case "note": {
        if (text.length < 2 || text.length > 500) return ctx.reply(tr(ctx, "note_invalid"));
        await tidy(ctx, d);
        const job = await repo.getJob(d.job);
        if (!job) return ctx.reply(tr(ctx, "not_found"));
        if (d.key === "materials") {
          const kb = new InlineKeyboard()
            .text(tr(ctx, "btn_tomorrow"), "pd:1")
            .text(tr(ctx, "btn_in2"), "pd:2")
            .text(tr(ctx, "btn_in3"), "pd:3")
            .row()
            .text(tr(ctx, "btn_no_date"), "pd:0");
          return prompt(ctx, "promise", { ...d, note: text }, tr(ctx, "ask_promised"), kb);
        }
        return prompt(ctx, "photo", { ...d, note: text }, tr(ctx, "ask_photo"));
      }
      case "promise": {
        const date = parseUserDate(text, today());
        if (!date) return ctx.reply(tr(ctx, "date_invalid"));
        const data = await repo.takeState(ctx.u.id, "promise");
        if (!data) return;
        await tidy(ctx, data);
        return applyCheck(ctx, data.job, data.key, data.value, { note: data.note, promisedDate: date });
      }
      case "photo":
        return ctx.reply(tr(ctx, "photo_required"));
      case "amount": {
        const job = await repo.getJob(d.job);
        if (!job) return ctx.reply(tr(ctx, "not_found"));
        const amt = parseMoney(text);
        if (amt === null || !validPartlyAmount(amt, job.price)) {
          return ctx.reply(tr(ctx, "amount_invalid", { price: money(ctx.lang, job.price) }));
        }
        const data = await repo.takeState(ctx.u.id, "amount");
        if (!data) return;
        await tidy(ctx, data);
        return applyCheck(ctx, data.job, "payment", "partly", { amount: amt });
      }
      case "search":
      case "search_done": {
        const q = name1(text).slice(0, 50);
        await tidy(ctx, d);
        await repo.setState(ctx.u.id, "search_done", { q });
        return showList(ctx, "a", 0, q);
      }
      case "exc_reason": {
        if (text.length < 3) return ctx.reply(tr(ctx, "reason_invalid"));
        const data = await repo.takeState(ctx.u.id, "exc_reason");
        if (!data) return;
        await tidy(ctx, data);
        return closeDo(ctx, data.job, text.slice(0, 500));
      }
      case "edit_name": {
        const n = name1(text);
        if (n.length < 1 || n.length > 100) return ctx.reply(tr(ctx, "name_invalid"));
        await repo.clearState(ctx.u.id);
        await tidy(ctx, d);
        return editApply(ctx, d.job, "name", n);
      }
      case "edit_date": {
        const date = parseUserDate(text, today());
        if (!date) return ctx.reply(tr(ctx, "date_invalid"));
        await tidy(ctx, d);
        return editDate(ctx, d.job, date, false);
      }
      case "edit_price": {
        const p = parseMoney(text);
        if (p === null) return ctx.reply(tr(ctx, "price_invalid"));
        await repo.clearState(ctx.u.id);
        await tidy(ctx, d);
        return editApply(ctx, d.job, "price", p);
      }
      case "offer_date": {
        const date = parseUserDate(text, today());
        if (!date) return ctx.reply(tr(ctx, "date_invalid"));
        await tidy(ctx, d);
        return offerDate(ctx, d.job, date);
      }
      case "offer_reason": {
        if (text.length < 3) return ctx.reply(tr(ctx, "reason_invalid"));
        const data = await repo.takeState(ctx.u.id, "offer_reason");
        if (!data) return;
        await tidy(ctx, data);
        return offerSend(ctx, data.job, data.date, text.slice(0, 300));
      }
      case "inv_name": {
        const n = name1(text);
        if (n.length < 1 || n.length > 60) return ctx.reply(tr(ctx, "name_invalid"));
        if (!canManage(ctx.u)) return ctx.reply(tr(ctx, "forbidden"));
        const data = await repo.takeState(ctx.u.id, "inv_name");
        if (!data) return;
        await tidy(ctx, data);
        const r = await act.createInvite(ctx.u, data.role, n);
        if (!r.ok) return ctx.reply(failText(ctx, r));
        const code = r.code;
        const username = ctx.me.username;
        return ctx.reply(
          tr(ctx, "invite_created", {
            role: v.roleName(ctx.lang, data.role),
            name: esc(n),
            link: `https://t.me/${username}?start=inv_${code}`,
            code,
          }),
          { ...HTML, reply_markup: new InlineKeyboard().text(tr(ctx, "btn_users"), "u").text(tr(ctx, "btn_menu"), "m") },
        );
      }
      default:
        await repo.clearState(ctx.u.id);
        return ctx.reply(tr(ctx, "unknown_input"));
    }
  });

  // Photo for a reported problem
  bot.on("message:photo", async (ctx) => {
    const s = await repo.getState(ctx.u.id);
    if (s?.state !== "photo") return ctx.reply(tr(ctx, "unknown_input"));
    const data = await repo.takeState(ctx.u.id, "photo");
    if (!data) return;
    await tidy(ctx, data);
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    return applyCheck(ctx, data.job, data.key, data.value, { note: data.note, photoFileId: fileId });
  });

  bot.on("message", async (ctx) => {
    const s = await repo.getState(ctx.u.id);
    await ctx.reply(tr(ctx, s?.state === "photo" ? "photo_required" : "unknown_input"));
  });

  return bot;
}

// ---------------- new job ----------------

async function askNewJobDate(ctx: Ctx, data: Record<string, any>) {
  return prompt(ctx, "nj_date", { name: data.name }, tr(ctx, "nj_ask_date", { name: esc(data.name) }), v.dateButtons(ctx.lang, "nd:"));
}

async function newJobDate(ctx: Ctx, date: string, confirmed: boolean) {
  const s = await repo.getState(ctx.u.id);
  if (s?.state !== "nj_date") return toast(ctx, tr(ctx, "expired"), true);
  if (diffDays(today(), date) < 0 && !confirmed) {
    const kb = new InlineKeyboard().text(tr(ctx, "btn_yes"), `ndy:${packDate(date)}`).text(tr(ctx, "btn_other_date"), "ndb");
    return prompt(ctx, "nj_date", s.data, tr(ctx, "date_past_confirm", { date: fmtDate(date) }), kb);
  }
  const tailors = await repo.activeUsers("tailor");
  if (!tailors.length) {
    await repo.clearState(ctx.u.id);
    return show(ctx, { text: tr(ctx, "no_tailors"), kb: new InlineKeyboard().text(tr(ctx, "btn_menu"), "m") });
  }
  const data = { name: s.data.name, date };
  return prompt(
    ctx,
    "nj_tailor",
    data,
    tr(ctx, "nj_ask_tailor", { name: esc(data.name), date: fmtDate(date) }),
    v.tailorButtons(tailors, "nt:"),
  );
}

async function newJobTailor(ctx: Ctx, tailorId: number) {
  const s = await repo.getState(ctx.u.id);
  if (s?.state !== "nj_tailor") return toast(ctx, tr(ctx, "expired"), true);
  const tailor = await repo.userById(tailorId);
  if (!tailor || tailor.role !== "tailor" || !tailor.is_active) return toast(ctx, tr(ctx, "expired"), true);
  return prompt(ctx, "nj_price", { ...s.data, tailor: tailorId }, tr(ctx, "nj_ask_price"));
}

async function newJobSummary(ctx: Ctx, data: Record<string, any>) {
  const tailor = await repo.userById(data.tailor);
  await repo.setState(ctx.u.id, "nj_confirm", data);
  return show(ctx, {
    text: tr(ctx, "nj_summary", {
      name: esc(data.name),
      date: fmtDate(data.date),
      tailor: esc(tailor?.name ?? "?"),
      price: money(ctx.lang, data.price),
      seller: who(ctx),
    }),
    kb: new InlineKeyboard().text(tr(ctx, "btn_confirm"), "nc").text(tr(ctx, "btn_cancel"), "nx"),
  });
}

async function newJobConfirm(ctx: Ctx) {
  if (!canCreateJob(ctx.u)) return toast(ctx, tr(ctx, "forbidden"), true);
  const data = await repo.takeState(ctx.u.id, "nj_confirm"); // a double tap finds nothing the second time
  if (!data) return toast(ctx, tr(ctx, "expired"));
  const r = await act.createJob(ctx.api, ctx.u, { name: data.name, install_date: data.date, price: data.price, tailor_id: data.tailor });
  if (!r.ok) return toast(ctx, failText(ctx, r), true);
  await toast(ctx, tr(ctx, "saved"));
  await showCard(ctx, r.id);
  await r.followUp();
}

// ---------------- checks ----------------

async function openPicker(ctx: Ctx, jobId: number, key: CheckKey | undefined) {
  const job = await loadJob(ctx, jobId);
  if (!job || !key) return;
  if (job.status !== "open") return toast(ctx, tr(ctx, "job_not_open"), true);
  if (!canSetCheck(ctx.u, job, key)) return toast(ctx, tr(ctx, "forbidden"), true);
  await repo.clearState(ctx.u.id);
  return show(ctx, v.pickerView(ctx.lang, job, key));
}

async function pickValue(ctx: Ctx, jobId: number, key: CheckKey | undefined, idx: number) {
  const job = await loadJob(ctx, jobId);
  if (!job || !key) return;
  const value = CHECKS[key].values[idx];
  if (!value) return toast(ctx, tr(ctx, "expired"), true);
  if (job.status !== "open") return toast(ctx, tr(ctx, "job_not_open"), true);
  if (!canSetCheck(ctx.u, job, key)) return toast(ctx, tr(ctx, "forbidden"), true);
  const data = { job: jobId, key, value };
  if (needsNote(key, value)) {
    const k = key === "materials" ? "ask_note_materials" : "ask_note_problem";
    return prompt(ctx, "note", data, tr(ctx, k, { name: esc(job.name) }));
  }
  if (needsAmount(key, value)) {
    return prompt(ctx, "amount", data, tr(ctx, "ask_amount", { name: esc(job.name), price: money(ctx.lang, job.price) }));
  }
  return applyCheck(ctx, jobId, key, value, {});
}

async function promisedChosen(ctx: Ctx, days: number) {
  const data = await repo.takeState(ctx.u.id, "promise");
  if (!data) return toast(ctx, tr(ctx, "expired"), true);
  const promisedDate = days > 0 ? addDays(today(), days) : null;
  return applyCheck(ctx, data.job, data.key, data.value, { note: data.note, promisedDate });
}

async function applyCheck(ctx: Ctx, jobId: number, key: CheckKey, value: string, input: CheckInput) {
  const r = await act.setCheck(ctx.api, ctx.u, jobId, key, value, input);
  if (!r.ok) {
    await toast(ctx, failText(ctx, r), true);
    if (r.error !== "not_found") await showCard(ctx, jobId);
    return;
  }
  await toast(ctx, tr(ctx, r.changed ? "saved" : "no_change"));
  await showCard(ctx, jobId);
  await r.followUp();
}

async function claimDelivered(ctx: Ctx, jobId: number) {
  const r = await act.claimDelivered(ctx.api, ctx.u, jobId);
  if (!r.ok) {
    await toast(ctx, failText(ctx, r), true);
    if (r.error !== "not_found") await showCard(ctx, jobId);
    return;
  }
  await toast(ctx, tr(ctx, r.changed ? "delivered_saved" : "no_change"));
  await showCard(ctx, jobId);
  await r.followUp();
}

async function showHistory(ctx: Ctx, jobId: number, all: boolean) {
  const job = await loadJob(ctx, jobId);
  if (!job) return;
  const { events, total } = await repo.history(jobId, all ? null : 10);
  const names = new Map((await repo.listUsers()).map((u) => [String(u.id), u.name]));
  return show(ctx, v.historyView(ctx.lang, job, events, total, all, names));
}

async function sendPhotos(ctx: Ctx, jobId: number) {
  const photos = await repo.jobPhotos(jobId);
  if (!photos.length) return toast(ctx, tr(ctx, "list_empty"));
  await toast(ctx, "📷");
  await ctx.replyWithMediaGroup(
    photos.map((p) => ({ type: "photo" as const, media: p.telegram_file_id, caption: (p.caption ?? "").slice(0, 1000) })),
  );
}

// ---------------- new install date ----------------

async function offerAsk(ctx: Ctx, jobId: number) {
  const job = await loadJob(ctx, jobId);
  if (!job) return;
  if (!canProposeDate(ctx.u, job)) return toast(ctx, tr(ctx, job.status !== "open" ? "job_not_open" : "forbidden"), true);
  const kb = new InlineKeyboard()
    .text(tr(ctx, "btn_tomorrow"), `dod:${jobId}:1`)
    .text(tr(ctx, "btn_in2"), `dod:${jobId}:2`)
    .text(tr(ctx, "btn_in3"), `dod:${jobId}:3`)
    .row();
  return prompt(ctx, "offer_date", { job: jobId }, tr(ctx, "ask_offer_date", { name: esc(job.name), date: fmtDate(job.install_date) }), kb);
}

async function offerDate(ctx: Ctx, jobId: number, date: string) {
  const s = await repo.getState(ctx.u.id);
  if (s?.state !== "offer_date" || s.data.job !== jobId) return toast(ctx, tr(ctx, "expired"), true);
  if (diffDays(today(), date) < 0) return ctx.reply(tr(ctx, "offer_date_past"));
  return prompt(ctx, "offer_reason", { job: jobId, date }, tr(ctx, "ask_offer_reason"));
}

async function offerSend(ctx: Ctx, jobId: number, date: string, reason: string) {
  const r = await act.proposeDate(ctx.api, ctx.u, jobId, date, reason);
  if (!r.ok) {
    await toast(ctx, failText(ctx, r), true);
    return showCard(ctx, jobId);
  }
  await ctx.reply(tr(ctx, "offer_sent"));
  await showCard(ctx, jobId);
  await r.followUp();
}

async function offerDecide(ctx: Ctx, offerId: number, approve: boolean) {
  const r = await act.decideDate(ctx.api, ctx.u, offerId, approve);
  if (!r.ok) return toast(ctx, failText(ctx, r), true);
  await toast(ctx, tr(ctx, "saved"));
  await showCard(ctx, r.jobId);
  await r.followUp();
}

// ---------------- close / cancel ----------------

async function closeAsk(ctx: Ctx, jobId: number) {
  const job = await loadJob(ctx, jobId);
  if (!job) return;
  const d = canClose(ctx.u, job, await repo.getChecks(jobId));
  if (!d.ok) {
    const msg = d.reason === "incomplete" ? tr(ctx, "close_missing", { list: v.missingList(ctx.lang, d.missing) }) : tr(ctx, d.reason === "not_open" ? "job_not_open" : "forbidden");
    return toast(ctx, msg, true);
  }
  if (d.exception) return toast(ctx, tr(ctx, "close_missing", { list: v.missingList(ctx.lang, d.missing) }), true);
  return show(ctx, {
    text: tr(ctx, "close_confirm", { name: esc(job.name) }),
    kb: new InlineKeyboard().text(tr(ctx, "btn_confirm"), `cly:${jobId}`).text(tr(ctx, "btn_back"), `j:${jobId}`),
  });
}

async function exceptionAsk(ctx: Ctx, jobId: number) {
  const job = await loadJob(ctx, jobId);
  if (!job) return;
  const d = canClose(ctx.u, job, await repo.getChecks(jobId));
  if (!d.ok || !isAdmin(ctx.u)) return toast(ctx, tr(ctx, d.ok ? "forbidden" : d.reason === "not_open" ? "job_not_open" : "forbidden"), true);
  if (!d.exception) return closeAsk(ctx, jobId);
  return prompt(ctx, "exc_reason", { job: jobId }, tr(ctx, "exc_ask_reason", { name: esc(job.name), list: v.missingList(ctx.lang, d.missing) }));
}

async function closeDo(ctx: Ctx, jobId: number, reason: string | null) {
  const r = await act.closeJob(ctx.api, ctx.u, jobId, reason);
  if (!r.ok) {
    await toast(ctx, failText(ctx, r), true);
    if (r.error !== "not_found") await showCard(ctx, jobId);
    return;
  }
  await toast(ctx, tr(ctx, "closed_ok"));
  await showCard(ctx, jobId);
  await r.followUp();
}

async function cancelAsk(ctx: Ctx, jobId: number) {
  const job = await loadJob(ctx, jobId);
  if (!job) return;
  if (!canCancelJob(ctx.u, job)) return toast(ctx, tr(ctx, job.status !== "open" ? "job_not_open" : "forbidden"), true);
  return show(ctx, {
    text: tr(ctx, "cancel_confirm", { name: esc(job.name) }),
    kb: new InlineKeyboard().text(tr(ctx, "btn_confirm"), `cxy:${jobId}`).text(tr(ctx, "btn_back"), `j:${jobId}`),
  });
}

async function cancelDo(ctx: Ctx, jobId: number) {
  const r = await act.cancelJob(ctx.api, ctx.u, jobId);
  if (!r.ok) return toast(ctx, failText(ctx, r), true);
  if (r.changed) await toast(ctx, tr(ctx, "cancelled_ok"));
  await showCard(ctx, jobId);
  await r.followUp();
}

// ---------------- edit ----------------

async function editMenu(ctx: Ctx, jobId: number) {
  const job = await loadJob(ctx, jobId);
  if (!job) return;
  if (!canEditJob(ctx.u, job)) return toast(ctx, tr(ctx, "forbidden"), true);
  await repo.clearState(ctx.u.id);
  return show(ctx, {
    text: tr(ctx, "edit_title", { name: esc(job.name) }),
    kb: new InlineKeyboard()
      .text(v.fieldName(ctx.lang, "name"), `en:${jobId}`)
      .text(v.fieldName(ctx.lang, "install_date"), `ed:${jobId}`)
      .row()
      .text(v.fieldName(ctx.lang, "tailor_id"), `et:${jobId}`)
      .text(v.fieldName(ctx.lang, "price"), `ep:${jobId}`)
      .row()
      .text(tr(ctx, "btn_back"), `j:${jobId}`),
  });
}

async function editAsk(ctx: Ctx, jobId: number, what: string) {
  const job = await loadJob(ctx, jobId);
  if (!job) return;
  if (!canEditJob(ctx.u, job)) return toast(ctx, tr(ctx, "forbidden"), true);
  if (what === "en") return prompt(ctx, "edit_name", { job: jobId }, tr(ctx, "ask_new_name"));
  if (what === "ep") return prompt(ctx, "edit_price", { job: jobId }, tr(ctx, "ask_new_price"));
  if (what === "ed") return prompt(ctx, "edit_date", { job: jobId }, tr(ctx, "ask_new_date"), v.dateButtons(ctx.lang, `edd:${jobId}:`));
  const tailors = (await repo.activeUsers("tailor")).filter((x) => x.id !== job.tailor_id);
  if (!tailors.length) return toast(ctx, tr(ctx, "no_tailors"), true);
  const kb = v.tailorButtons(tailors, `ett:${jobId}:`).text(tr(ctx, "btn_back"), `e:${jobId}`);
  return show(ctx, { text: tr(ctx, "ask_new_tailor"), kb });
}

async function editDate(ctx: Ctx, jobId: number, date: string, confirmed: boolean) {
  if (diffDays(today(), date) < 0 && !confirmed) {
    const kb = new InlineKeyboard().text(tr(ctx, "btn_yes"), `edy:${jobId}:${packDate(date)}`).text(tr(ctx, "btn_other_date"), `ed:${jobId}`);
    return prompt(ctx, "edit_date", { job: jobId }, tr(ctx, "date_past_confirm", { date: fmtDate(date) }), kb);
  }
  await repo.clearState(ctx.u.id);
  return editApply(ctx, jobId, "install_date", date);
}

async function editApply(ctx: Ctx, jobId: number, field: EditField, value: string | number) {
  const r = await act.editJob(ctx.api, ctx.u, jobId, field, value);
  if (!r.ok) return toast(ctx, failText(ctx, r), true);
  await toast(ctx, tr(ctx, r.changed ? "saved" : "no_change"));
  await showCard(ctx, jobId);
  await r.followUp();
}

// ---------------- admin ----------------

async function usersScreen(ctx: Ctx) {
  if (!canManage(ctx.u)) return toast(ctx, tr(ctx, "forbidden"), true);
  await repo.clearState(ctx.u.id);
  return show(ctx, v.usersView(ctx.lang, await repo.listUsers()));
}

async function userScreen(ctx: Ctx, id: number) {
  if (!canManage(ctx.u)) return toast(ctx, tr(ctx, "forbidden"), true);
  const u = await repo.userById(id);
  if (!u) return toast(ctx, tr(ctx, "expired"), true);
  return show(ctx, v.userView(ctx.lang, u, ctx.u));
}

async function userRole(ctx: Ctx, id: number, letter: string) {
  const role = v.roleFromLetter(letter);
  if (!role) return toast(ctx, tr(ctx, "forbidden"), true);
  const r = await act.setUserRole(ctx.u, id, role);
  if (!r.ok) return toast(ctx, failText(ctx, r), true);
  await toast(ctx, tr(ctx, "saved"));
  return userScreen(ctx, id);
}

async function userToggle(ctx: Ctx, id: number) {
  const u = await repo.userById(id);
  if (!u) return toast(ctx, tr(ctx, "expired"), true);
  const r = await act.setUserActive(ctx.u, id, !u.is_active);
  if (!r.ok) return toast(ctx, failText(ctx, r), true);
  await toast(ctx, tr(ctx, "saved"));
  return userScreen(ctx, id);
}

async function reportScreen(ctx: Ctx) {
  if (!canManage(ctx.u)) return toast(ctx, tr(ctx, "forbidden"), true);
  const parts = await reportFor(ctx.lang, today());
  const kb = new InlineKeyboard().text(tr(ctx, "btn_backup"), "bk").text(tr(ctx, "btn_menu"), "m");
  if (parts.length === 1) return show(ctx, { text: parts[0], kb });
  await toast(ctx, "📊");
  for (let i = 0; i < parts.length; i++) {
    await ctx.reply(parts[i], { ...HTML, reply_markup: i === parts.length - 1 ? kb : undefined });
  }
}

async function sendBackup(ctx: Ctx) {
  if (!canManage(ctx.u)) return toast(ctx, tr(ctx, "forbidden"), true);
  const b = await latestBackup();
  if (b === "unavailable") return toast(ctx, tr(ctx, "backup_unavailable"), true);
  if (!b) return toast(ctx, tr(ctx, "backup_none"), true);
  await toast(ctx, "💾");
  await ctx.replyWithDocument(new InputFile(Buffer.from(b.data, "utf8"), b.key), { caption: tr(ctx, "backup_caption", { key: b.key }) });
}

