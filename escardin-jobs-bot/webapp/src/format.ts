// Money and dates for the screens. Dates are "YYYY-MM-DD" in Tashkent time, like on the server.
import { t } from "./i18n";

const NBSP = "\u00a0";
export const groupDigits = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
/** 4500000 -> "4 500 000 so'm" (never breaks across lines) */
export const money = (n: number | null | undefined) => t("money", { n: groupDigits(n ?? 0) }).replace(" ", NBSP);

const TZ = "Asia/Tashkent";

export function todayIso(now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return p.slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const diffDays = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const parts = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return { d: d.getUTCDate(), m: d.getUTCMonth(), wd: d.getUTCDay() };
};

/** "25-noyabr" / "25 November" */
export function dateLong(date: string | null | undefined, withWeekday = false): string {
  if (!date) return "—";
  const p = parts(date);
  const month = t("months").split(",")[p.m];
  const weekday = t("weekdays").split(",")[p.wd];
  return t(withWeekday ? "date_weekday" : "date_long", { d: p.d, month, weekday });
}

/** Timestamp -> "19.11 14:05" in Tashkent time */
export function dateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const x = Object.fromEntries(f.formatToParts(new Date(ts)).map((p) => [p.type, p.value]));
  return `${x.day}.${x.month} ${x.hour}:${x.minute}`;
}

export type DueKind = "overdue" | "today" | "tomorrow" | "soon" | "later";

export function due(installDate: string, today: string): { kind: DueKind; text: string } {
  const d = diffDays(today, installDate);
  if (d < 0) return { kind: "overdue", text: t("due_overdue", { n: -d }) };
  if (d === 0) return { kind: "today", text: t("due_today") };
  if (d === 1) return { kind: "tomorrow", text: t("due_tomorrow") };
  return { kind: d <= 3 ? "soon" : "later", text: t("due_in", { n: d }) };
}

/** Digits only, as typed into a money field -> number (or null when empty). */
export function readMoney(s: string): number | null {
  const digits = s.replace(/\D/g, "").slice(0, 13);
  return digits ? Number(digits) : null;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** "Gulnora Rahimova" -> "Gulnora R." (fits on small screens) */
export function shortName(name: string): string {
  const [first, second] = name.trim().split(/\s+/);
  return second ? `${first} ${second[0]!.toUpperCase()}.` : (first ?? name);
}
