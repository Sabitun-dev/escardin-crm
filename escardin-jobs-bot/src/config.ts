// All settings come from environment variables (Netlify UI, or .env locally).
// Values are read when needed, so tests run without any settings.

const env = (key: string, fallback = ""): string => (process.env[key] ?? fallback).trim();

function must(key: string): string {
  const v = env(key);
  if (!v) throw new Error(`Missing setting: ${key}`);
  return v;
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function hhmm(key: string, fallback: string): string {
  const v = env(key, fallback);
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return fallback;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export const cfg = {
  botToken: () => must("BOT_TOKEN"),
  webhookSecret: () => env("WEBHOOK_SECRET"),
  adminIds: (): number[] =>
    env("ADMIN_TELEGRAM_IDS")
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0),
  dbUrl: (): string => {
    const v = env("DATABASE_URL") || env("NETLIFY_DATABASE_URL");
    if (!v) throw new Error("Missing setting: DATABASE_URL");
    return v;
  },
  groupChatId: (): number | null => {
    const v = env("GROUP_CHAT_ID");
    return v && Number.isFinite(Number(v)) ? Number(v) : null;
  },
  /** Public site address (Netlify sets URL itself). Used for the Mini App at /app/. */
  siteUrl: (): string | null => {
    const v = env("APP_URL") || env("URL");
    return /^https:\/\//.test(v) ? v.replace(/\/+$/, "") : null;
  },
  timezone: () => env("TIMEZONE", "Asia/Tashkent"),
  defaultLang: (): "uz" | "en" => (env("DEFAULT_LANGUAGE", "uz").toLowerCase() === "en" ? "en" : "uz"),
  dailyTime: () => hhmm("DAILY_CHECK_TIME", "09:00"),
  weeklyTime: () => hhmm("WEEKLY_REPORT_TIME", "18:00"),
  /** 0 = Sunday ... 6 = Saturday */
  weeklyDay: (): number => {
    const v = env("WEEKLY_REPORT_DAY", "sunday").toLowerCase();
    const i = DAYS.findIndex((d) => d.startsWith(v.slice(0, 3)));
    return i >= 0 ? i : 0;
  },
};
