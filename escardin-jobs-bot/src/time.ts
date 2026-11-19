// Dates. Times are stored in UTC; calendar dates are "YYYY-MM-DD" strings in the business time zone.
import { cfg } from "./config";

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(now = new Date(), tz = cfg.timezone()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

export const todayLocal = (now = new Date()) => localParts(now).date;

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "2026-11-25" -> "25.11" */
export function fmtDate(date: string | null | undefined): string {
  if (!date) return "—";
  const [, m, d] = date.split("-");
  return `${d}.${m}`;
}

/** UTC timestamp -> "25.11 14:05" in the business time zone */
export function fmtDateTime(ts: Date | string | null | undefined, tz = cfg.timezone()): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const p = localParts(d, tz);
  return `${fmtDate(p.date)} ${p.hhmm}`;
}

/**
 * Reads "25.11", "25/11", "25.11.2026" or "25.11.26".
 * Without a year, the current year is used, or next year if that date is more than 60 days in the past.
 */
export function parseUserDate(text: string, today: string): string | null {
  const m = /^\s*(\d{1,2})[./\-](\d{1,2})(?:[./\-](\d{2}|\d{4}))?\s*$/.exec(text);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(today.slice(0, 4));
  const build = (y: number) => `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  let iso = build(year);
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null;
  if (!m[3] && diffDays(today, iso) < -60) {
    year += 1;
    iso = build(year);
  }
  return iso;
}

/** "YYYY-MM-DD" <-> "YYYYMMDD" for short button data */
export const packDate = (d: string) => d.replaceAll("-", "");
export const unpackDate = (s: string) =>
  /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
