// Sending messages to people and to the group. One failed message never stops the others.
import { type Api, GrammyError, InlineKeyboard } from "grammy";
import { cfg } from "./config";
import { type Lang, esc, t } from "./i18n";
import {
  type Job,
  type User,
  activeUsers,
  claimNotification,
  markRun,
  setGroupMessageId,
  setUserReachable,
  userById,
} from "./repo";
import type { Audience } from "./rules/permissions";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Error text that is safe to log or show (never contains the token). */
export function describe(e: unknown): string {
  let msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  try {
    const token = process.env.BOT_TOKEN;
    if (token) msg = msg.split(token).join("***");
  } catch {}
  return msg.slice(0, 400);
}

const isBlocked = (e: unknown) => e instanceof GrammyError && e.error_code === 403;
const retryAfter = (e: unknown) =>
  e instanceof GrammyError && e.error_code === 429 ? (e.parameters?.retry_after ?? 1) : 0;

export interface Outgoing {
  text: string;
  kb?: InlineKeyboard;
  photo?: string | null;
}

async function rawSend(api: Api, chatId: number, m: Outgoing, replyTo?: number | null) {
  const reply_parameters = replyTo ? { message_id: replyTo, allow_sending_without_reply: true } : undefined;
  if (m.photo) {
    return api.sendPhoto(chatId, m.photo, { caption: m.text.slice(0, 1024), parse_mode: "HTML", reply_markup: m.kb, reply_parameters });
  }
  return api.sendMessage(chatId, m.text, {
    parse_mode: "HTML",
    reply_markup: m.kb,
    reply_parameters,
    link_preview_options: { is_disabled: true },
  });
}

/** Sends to one user. Returns true when delivered. */
export async function sendTo(api: Api, user: User, m: Outgoing): Promise<boolean> {
  if (!user.is_active || !user.is_reachable) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await rawSend(api, user.telegram_id, m);
      return true;
    } catch (e) {
      if (isBlocked(e)) {
        await markUnreachable(api, user);
        return false;
      }
      const wait = retryAfter(e);
      if (wait && attempt === 0 && wait <= 5) {
        await sleep(wait * 1000);
        continue;
      }
      console.error(`send to user ${user.id} failed:`, describe(e));
      return false;
    }
  }
  return false;
}

/** Marks a user who blocked the bot and tells the admins once. */
export async function markUnreachable(api: Api, user: User) {
  await setUserReachable(user.id, false);
  if (!(await claimNotification("unreachable", 0, user.id, "2000-01-01"))) return;
  const admins = (await activeUsers("admin")).filter((a) => a.id !== user.id && a.is_reachable);
  for (const a of admins) {
    try {
      await rawSend(api, a.telegram_id, { text: t(a.language, "n_unreachable", { name: esc(user.name) }) });
    } catch {}
  }
}

/** Sends a message (built in each person's language) to many users, skipping duplicates and one user. */
export async function notifyMany(api: Api, users: User[], build: (lang: Lang) => Outgoing, excludeUserId?: number) {
  const seen = new Set<number>();
  for (const u of users) {
    if (u.id === excludeUserId || seen.has(u.id)) continue;
    seen.add(u.id);
    try {
      await sendTo(api, u, build(u.language));
    } catch (e) {
      console.error("notify failed:", describe(e));
    }
    await sleep(40); // stay well under Telegram's rate limit
  }
}

/** Resolves "seller / tailor / admins" for a job into users. */
export async function audienceUsers(job: Pick<Job, "seller_id" | "tailor_id">, audience: Audience[]): Promise<User[]> {
  const out: User[] = [];
  if (audience.includes("seller")) {
    const s = await userById(job.seller_id);
    if (s) out.push(s);
  }
  if (audience.includes("tailor")) {
    const tl = await userById(job.tailor_id);
    if (tl) out.push(tl);
  }
  if (audience.includes("admins")) out.push(...(await activeUsers("admin")));
  return out;
}

let botUsername: string | null = null;
export async function getBotUsername(api: Api): Promise<string> {
  if (!botUsername) botUsername = (await api.getMe()).username;
  return botUsername;
}
export const setBotUsername = (u: string) => (botUsername = u);

/**
 * Posts to the team group. The first post about a job starts a thread;
 * every later change is a reply to it, so the team can discuss each job in one place.
 */
export async function postToGroup(api: Api, job: Pick<Job, "id" | "group_message_id">, text: string, photo?: string | null) {
  const chat = cfg.groupChatId();
  if (!chat) return;
  const lang = cfg.defaultLang();
  try {
    const username = await getBotUsername(api);
    const kb = new InlineKeyboard().url(t(lang, "btn_open"), `https://t.me/${username}?start=j${job.id}`);
    const msg = await rawSend(api, chat, { text, kb, photo }, job.group_message_id);
    if (!job.group_message_id) {
      await setGroupMessageId(job.id, msg.message_id);
      job.group_message_id = msg.message_id;
    }
  } catch (e) {
    console.error("group post failed:", describe(e));
  }
}

/** Tells admins about an error, at most once every 10 minutes. */
export async function alertAdmins(api: Api, error: unknown) {
  try {
    const bucket = new Date(Math.floor(Date.now() / 600_000) * 600_000).toISOString();
    if (!(await markRun("error_alert", bucket))) return;
    const admins = await activeUsers("admin");
    for (const a of admins) {
      if (!a.is_reachable) continue;
      try {
        await rawSend(api, a.telegram_id, { text: t(a.language, "n_error", { msg: esc(describe(error)) }) });
      } catch {}
    }
  } catch (e) {
    console.error("alertAdmins failed:", describe(e));
  }
}
