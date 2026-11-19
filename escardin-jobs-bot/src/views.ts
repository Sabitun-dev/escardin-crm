// Builds message texts and inline keyboards. No database access here.
import { InlineKeyboard } from "grammy";
import { cfg } from "./config";
import { type Key, type Lang, esc, money, t } from "./i18n";
import type { Job, JobEvent, ListFilter, ListItem, User } from "./repo";
import { FILTERS, PAGE_SIZE } from "./repo";
import { CHECKS, CHECK_KEYS, type CheckKey, type CheckRow, isComplete, ordered, passes, progress } from "./rules/checks";
import {
  type Role,
  canCancelJob,
  canClaimDelivered,
  canClose,
  canCreateJob,
  canEditJob,
  canManage,
  canSetCheck,
  isAdmin,
} from "./rules/permissions";
import type { ReportSections } from "./rules/reminders";
import { diffDays, fmtDate, fmtDateTime } from "./time";

export interface View {
  text: string;
  kb: InlineKeyboard;
}

// ---------- small pieces ----------

export const roleName = (lang: Lang, role: Role) => t(lang, `role_${role}` as Key);
export const checkName = (lang: Lang, key: CheckKey) => t(lang, `ck_${key}` as Key);
export const checkNum = (key: CheckKey) => CHECK_KEYS.indexOf(key) + 1;
export const valueName = (lang: Lang, key: CheckKey, value: string | null) =>
  value ? t(lang, `v_${key}_${value}` as Key) : t(lang, "not_set");
export const fieldName = (lang: Lang, field: string) => t(lang, `field_${field}` as Key);

export function icon(row: Pick<CheckRow, "key" | "value">): string {
  if (row.value === null) return "▫️";
  if (passes(row)) return "✅";
  if (row.key === "payment") return row.value === "partly" ? "🟡" : "🔴";
  if (row.key === "materials" || row.key === "quality") return "⚠️";
  return "❌";
}

export const bar = (n: number) => "▰".repeat(n) + "▱".repeat(CHECK_KEYS.length - n);

export function dueLabel(lang: Lang, installDate: string, today: string): string {
  const d = diffDays(today, installDate);
  if (d === 0) return t(lang, "due_today");
  if (d === 1) return t(lang, "due_tomorrow");
  if (d > 1) return t(lang, "due_in", { n: d });
  return t(lang, "due_overdue", { n: -d });
}

const missingList = (lang: Lang, keys: CheckKey[]) => keys.map((k) => `${checkNum(k)}. ${checkName(lang, k)}`).join(", ");
export { missingList };

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Keeps a message under Telegram's 4096-character limit. */
export function fit(text: string, max = 4000): string {
  return text.length <= max ? text : text.slice(0, max - 2) + "\n…";
}

/** Splits long text into several messages at line breaks. */
export function chunks(text: string, max = 3900): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if ((cur + "\n" + line).length > max && cur) {
      out.push(cur);
      cur = line;
    } else cur = cur ? cur + "\n" + line : line;
  }
  if (cur) out.push(cur);
  return out;
}

export const openKb = (lang: Lang, jobId: number) => new InlineKeyboard().text(t(lang, "btn_open"), `j:${jobId}`);

// ---------- menu & help ----------

export function mainMenu(lang: Lang, u: User): View {
  const kb = new InlineKeyboard();
  if (canCreateJob(u)) kb.text(t(lang, "btn_new_job"), "nj");
  kb.text(t(lang, "btn_jobs"), `l:a:0`).row();
  if (canManage(u)) kb.text(t(lang, "btn_users"), "u").text(t(lang, "btn_reports"), "r").row();
  kb.text(t(lang, "btn_help"), "help");
  return { text: t(lang, "menu_title", { name: esc(u.name), role: roleName(lang, u.role) }), kb };
}

export function helpView(lang: Lang): View {
  const kb = new InlineKeyboard()
    .text("🇺🇿 O'zbekcha", "lang:uz")
    .text("🇬🇧 English", "lang:en")
    .row()
    .text(t(lang, "btn_menu"), "m");
  return { text: t(lang, "help_text", { daily: cfg.dailyTime() }), kb };
}

// ---------- jobs list ----------

export function listView(
  lang: Lang,
  items: ListItem[],
  total: number,
  filter: ListFilter,
  page: number,
  today: string,
  search?: string,
): View {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const title = search
    ? t(lang, "list_search_title", { q: esc(search), count: total })
    : t(lang, "list_title", { filter: t(lang, `f_${filter}` as Key), count: total });
  const lines = [title + (pages > 1 ? ` · ${page + 1}/${pages}` : ""), ""];
  if (!items.length) lines.push(t(lang, "list_empty"));

  items.forEach((j, i) => {
    const n = page * PAGE_SIZE + i + 1;
    const c = ordered(j.checks);
    const pay = c[5];
    const payText = pay.value ? `${icon(pay)} ${valueName(lang, "payment", pay.value)}` : `▫️ ${t(lang, "pay_notset")}`;
    const status =
      j.status === "done" ? ` · ${t(lang, "status_done_short")}` : j.status === "cancelled" ? ` · ${t(lang, "status_cancelled_short")}` : "";
    lines.push(`<b>${n}. ${esc(short(j.name, 60))}</b>${status}`);
    lines.push(
      `📅 ${fmtDate(j.install_date)} · ${j.status === "open" ? dueLabel(lang, j.install_date, today) + " · " : ""}🧵 ${esc(j.tailor_name)} · 👤 ${esc(j.seller_name)}`,
    );
    lines.push(`${bar(progress(c))} ${progress(c)}/6 · ${payText}`);
    const m = c[0];
    if (m.value && m.value !== "all_received") {
      const promised = m.promised_date ? ` · ${t(lang, "promised_short", { date: fmtDate(m.promised_date) })}` : "";
      lines.push(`⚠️ ${valueName(lang, "materials", m.value)}: ${esc(short(m.note ?? "", 60))}${promised}`);
    }
    lines.push("");
  });

  const kb = new InlineKeyboard();
  items.forEach((j, i) => {
    kb.text(`${page * PAGE_SIZE + i + 1}. ${short(j.name, 28)}`, `j:${j.id}`).row();
  });
  if (pages > 1) {
    const nav = search ? "lq" : `l:${filter}`;
    if (page > 0) kb.text("◀️", search ? `lq:${page - 1}` : `${nav}:${page - 1}`);
    if (page < pages - 1) kb.text("▶️", search ? `lq:${page + 1}` : `${nav}:${page + 1}`);
    kb.row();
  }
  FILTERS.forEach((f, i) => {
    kb.text((f === filter && !search ? "• " : "") + t(lang, `f_${f}` as Key), `l:${f}:0`);
    if (i % 4 === 3) kb.row();
  });
  kb.text(t(lang, "btn_search"), "ls").text(t(lang, "btn_menu"), "m");
  return { text: fit(lines.join("\n")), kb };
}

// ---------- job card ----------

export function cardView(lang: Lang, u: User, job: Job, rows: CheckRow[], today: string, photoCount: number): View {
  const c = ordered(rows);
  const lines = [
    t(lang, "card_header", {
      name: esc(job.name),
      date: fmtDate(job.install_date),
      due: job.status === "open" ? dueLabel(lang, job.install_date, today) : "—",
      tailor: esc(job.tailor_name),
      seller: esc(job.seller_name),
      price: money(lang, job.price),
    }),
  ];
  if (job.status === "done") {
    const p = { date: fmtDateTime(job.closed_at), by: esc(job.closed_by_name ?? "—"), reason: esc(job.exception_reason ?? "") };
    lines.push("", job.closed_with_exception ? t(lang, "card_done_exc", p) : t(lang, "card_done", p));
  }
  if (job.status === "cancelled") {
    lines.push("", t(lang, "card_cancelled", { date: fmtDateTime(job.closed_at), by: esc(job.closed_by_name ?? "—") }));
  }
  lines.push("", `${bar(progress(c))} ${progress(c)}/6`, "");

  for (const r of c) {
    lines.push(`${icon(r)} ${checkNum(r.key)}. ${checkName(lang, r.key)}: <b>${valueName(lang, r.key, r.value)}</b>`);
    const sub: string[] = [];
    if (r.note) sub.push(t(lang, "note_line", { note: esc(r.note) }));
    if (r.promised_date) sub.push(t(lang, "promised_line", { date: fmtDate(r.promised_date) }));
    if (r.key === "materials" && r.delivered_claimed) sub.push(t(lang, "delivered_line"));
    if (r.key === "payment" && r.value) {
      const paid = r.amount ?? 0;
      sub.push(
        t(lang, "paid_line", { paid: money(lang, paid), price: money(lang, job.price), rest: money(lang, Math.max(0, job.price - paid)) }),
      );
    }
    if (r.updated_at) sub.push(`${esc(r.updated_by_name ?? "")}, ${fmtDateTime(r.updated_at)}`);
    for (const s of sub) lines.push(`   └ ${s}`);
  }

  const kb = new InlineKeyboard();
  if (job.status === "open") {
    const settable = CHECK_KEYS.filter((k) => canSetCheck(u, job, k));
    settable.forEach((k, i) => {
      kb.text(t(lang, "btn_set", { n: checkNum(k), check: short(checkName(lang, k), 18) }), `c:${job.id}:${CHECKS[k].short}`);
      if (i % 2 === 1) kb.row();
    });
    if (settable.length % 2 === 1) kb.row();
    if (canClaimDelivered(u, job) && c[0].value && c[0].value !== "all_received" && !c[0].delivered_claimed) {
      kb.text(t(lang, "btn_delivered"), `dl:${job.id}`).row();
    }
    const close = canClose(u, job, c);
    if (close.ok || close.reason === "incomplete") kb.text(t(lang, "btn_close"), `cl:${job.id}`).row();
    if (isAdmin(u) && !isComplete(c)) kb.text(t(lang, "btn_exception"), `ce:${job.id}`).row();
    if (canEditJob(u, job)) kb.text(t(lang, "btn_edit"), `e:${job.id}`);
    if (canCancelJob(u, job)) kb.text(t(lang, "btn_cancel_job"), `cx:${job.id}`);
    kb.row();
  }
  kb.text(t(lang, "btn_history"), `h:${job.id}`);
  if (photoCount > 0) kb.text(t(lang, "btn_photos", { n: photoCount }), `ph:${job.id}`);
  kb.row().text(t(lang, "btn_jobs"), "l:a:0").text(t(lang, "btn_menu"), "m");
  return { text: fit(lines.join("\n")), kb };
}

export function pickerView(lang: Lang, job: Job, key: CheckKey): View {
  const kb = new InlineKeyboard();
  CHECKS[key].values.forEach((v, i) => {
    kb.text(`${icon({ key, value: v })} ${valueName(lang, key, v)}`, `s:${job.id}:${CHECKS[key].short}:${i}`).row();
  });
  kb.text(t(lang, "btn_back"), `j:${job.id}`);
  return { text: t(lang, "picker_title", { name: esc(job.name), n: checkNum(key), check: checkName(lang, key) }), kb };
}

// ---------- history ----------

export function eventText(lang: Lang, e: JobEvent): string {
  const v = (val: string | null) => (e.check_key ? valueName(lang, e.check_key, val) : (val ?? "—"));
  let text: string;
  switch (e.event_type) {
    case "check_set":
      text = t(lang, "ev_check_set", { check: `${checkNum(e.check_key!)}. ${checkName(lang, e.check_key!)}`, old: v(e.old_value), new: v(e.new_value) });
      break;
    case "created":
    case "delivered_claimed":
    case "closed":
    case "closed_exception":
    case "cancelled":
      text = t(lang, `ev_${e.event_type}` as Key);
      break;
    default:
      if (e.event_type.startsWith("edited_")) {
        const field = e.event_type.slice(7);
        const fmt = (x: string | null) => (field === "install_date" ? fmtDate(x) : field === "price" ? money(lang, Number(x)) : esc(x ?? "—"));
        text = t(lang, "ev_edited", { field: fieldName(lang, field), old: fmt(e.old_value), new: fmt(e.new_value) });
      } else text = esc(e.event_type);
  }
  const note = e.note ? ` (${esc(short(e.note, 120))})` : "";
  return `• ${fmtDateTime(e.created_at)} — ${esc(e.user_name ?? "")}: ${text}${note}`;
}

/** Tailor names for edit events are stored as ids; the caller passes a name lookup. */
export function historyView(lang: Lang, job: Job, events: JobEvent[], total: number, all: boolean, names: Map<string, string>): View {
  const lines = [t(lang, "history_title", { name: esc(job.name), shown: events.length, total }), ""];
  if (!events.length) lines.push(t(lang, "history_empty"));
  for (const e of events) {
    const ev =
      e.event_type === "edited_tailor_id"
        ? { ...e, old_value: names.get(e.old_value ?? "") ?? e.old_value, new_value: names.get(e.new_value ?? "") ?? e.new_value }
        : e;
    lines.push(eventText(lang, ev));
  }
  // Keep the newest lines if too long
  let text = lines.join("\n");
  while (text.length > 4000 && lines.length > 3) {
    lines.splice(2, 1);
    text = lines.join("\n");
  }
  const kb = new InlineKeyboard();
  if (!all && total > events.length) kb.text(t(lang, "btn_history_all"), `ha:${job.id}`);
  kb.text(t(lang, "btn_back"), `j:${job.id}`);
  return { text, kb };
}

// ---------- new job ----------

export function dateButtons(lang: Lang, prefix: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, "btn_tomorrow"), `${prefix}1`)
    .text(t(lang, "btn_in3"), `${prefix}3`)
    .text(t(lang, "btn_week"), `${prefix}7`)
    .row();
}

export function tailorButtons(tailors: User[], prefix: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  tailors.forEach((tl, i) => {
    kb.text(short(tl.name, 30), `${prefix}${tl.id}`);
    if (i % 2 === 1) kb.row();
  });
  return kb.row();
}

// ---------- users ----------

export function usersView(lang: Lang, users: User[]): View {
  const kb = new InlineKeyboard();
  const lines = [t(lang, "users_title", { n: users.filter((u) => u.is_active).length }), ""];
  for (const u of users) {
    const mark = !u.is_active ? "⚫️" : !u.is_reachable ? "🔕" : "🟢";
    lines.push(`${mark} ${esc(u.name)} — ${roleName(lang, u.role)}`);
    kb.text(`${mark} ${short(u.name, 24)}`, `uu:${u.id}`).row();
  }
  kb.text(t(lang, "btn_invite"), "ui").row().text(t(lang, "btn_menu"), "m");
  return { text: fit(lines.join("\n")), kb };
}

export function userView(lang: Lang, u: User, me: User): View {
  const status = !u.is_active ? t(lang, "user_inactive") : !u.is_reachable ? t(lang, "user_unreachable") : t(lang, "user_active");
  const kb = new InlineKeyboard();
  if (u.id !== me.id) {
    (["seller", "tailor", "admin"] as Role[])
      .filter((r) => r !== u.role)
      .forEach((r) => kb.text(t(lang, "btn_make", { role: roleName(lang, r) }), `ur:${u.id}:${r[0]}`));
    kb.row().text(u.is_active ? t(lang, "btn_deactivate") : t(lang, "btn_activate"), `ua:${u.id}`).row();
  }
  kb.text(t(lang, "btn_back"), "u");
  return {
    text: t(lang, "user_card", { name: esc(u.name), role: roleName(lang, u.role), status, tg: u.telegram_id }),
    kb,
  };
}

export const roleFromLetter = (l: string): Role | null => (l === "s" ? "seller" : l === "t" ? "tailor" : l === "a" ? "admin" : null);

// ---------- report ----------

export function reportText(lang: Lang, r: ReportSections, today: string): string {
  const lines = [t(lang, "report_title", { date: fmtDate(today), n: r.open.length })];
  const row = (j: ReportSections["open"][number]) =>
    `• ${esc(short(j.name, 50))} — ${fmtDate(j.install_date)} (${dueLabel(lang, j.install_date, today)}), ${progress(j.checks)}/6`;
  const section = (title: string, list: ReportSections["open"], extra?: string) => {
    lines.push("", `<b>${title}</b> (${list.length})`);
    if (!list.length) lines.push(t(lang, "r_none"));
    list.slice(0, 15).forEach((j) => lines.push(row(j)));
    if (list.length > 15) lines.push(t(lang, "r_more", { n: list.length - 15 }));
    if (extra) lines.push(extra);
  };
  section(t(lang, "r_attention"), r.attention);
  section(t(lang, "r_overdue"), r.overdue);
  section(t(lang, "r_materials"), r.materials);
  section(t(lang, "r_problems"), r.problems);
  section(t(lang, "r_unpaid"), r.unpaid, t(lang, "r_debt", { sum: money(lang, r.debt) }));
  section(t(lang, "r_novideo"), r.noVideo);
  section(t(lang, "r_nolabel"), r.noLabel);
  return lines.join("\n");
}
