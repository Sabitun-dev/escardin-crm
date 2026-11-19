import en from "./locales/en";
import uz, { type Key } from "./locales/uz";

export type Lang = "uz" | "en";
export type { Key };

const LOCALES: Record<Lang, Record<Key, string>> = { uz, en };

/** Text for a key. Params are inserted as given, so escape user text first (see esc). */
export function t(lang: Lang, key: Key, params: Record<string, string | number> = {}): string {
  const s = LOCALES[lang]?.[key] ?? uz[key];
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
}

/** Escapes text typed by users before it goes into an HTML message. */
export const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 4500000 -> "4 500 000 so'm" */
export const money = (lang: Lang, n: number | null | undefined) =>
  t(lang, "money", { n: Math.round(n ?? 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") });
