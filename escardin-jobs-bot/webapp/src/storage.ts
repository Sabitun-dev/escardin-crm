// Small values kept between visits (drafts, "intro seen"). Telegram CloudStorage when available,
// otherwise the phone's local storage. Never throws.
import { tg } from "./tg";

const cloud = () => (tg && tg.isVersionAtLeast("6.9") ? tg.CloudStorage : undefined);
const KEY = (k: string) => k.replace(/[^\w-]/g, "_").slice(0, 120);

export function getItem(key: string): Promise<string | null> {
  const k = KEY(key);
  const c = cloud();
  if (c) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(local(k)), 1500);
      try {
        c.getItem(k, (err, v) => {
          clearTimeout(timer);
          resolve(err ? local(k) : v || local(k));
        });
      } catch {
        clearTimeout(timer);
        resolve(local(k));
      }
    });
  }
  return Promise.resolve(local(k));
}

export function setItem(key: string, value: string) {
  const k = KEY(key);
  try {
    localStorage.setItem(k, value);
  } catch {}
  try {
    cloud()?.setItem(k, value.slice(0, 4000));
  } catch {}
}

export function removeItem(key: string) {
  const k = KEY(key);
  try {
    localStorage.removeItem(k);
  } catch {}
  try {
    cloud()?.removeItem(k);
  } catch {}
}

function local(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const v = await getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
export const setJson = (key: string, v: unknown) => setItem(key, JSON.stringify(v));
