// Mini App texts. All words live in src/locales/app-uz.ts and app-en.ts.
import appEn from "../../src/locales/app-en";
import appUz, { type AppKey } from "../../src/locales/app-uz";
import type { AppLang } from "../../src/app-types";

export type { AppKey };
const LOCALES: Record<AppLang, Record<AppKey, string>> = { uz: appUz, en: appEn };

let lang: AppLang = "uz";
export const getLang = () => lang;
export function setLang(l: AppLang) {
  lang = l;
  document.documentElement.lang = l;
}

/** Text for a key. React escapes everything it shows, so user text is always safe here. */
export function t(key: AppKey, params: Record<string, string | number> = {}): string {
  const s = LOCALES[lang][key] ?? appUz[key];
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
}
