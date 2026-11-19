import { CHECK_KEYS, type CheckKey, type CheckRow, emptyCheck } from "../src/rules/checks";
import type { Actor, JobRef } from "../src/rules/permissions";

export const admin: Actor = { id: 1, role: "admin" };
export const seller: Actor = { id: 2, role: "seller" };
export const otherSeller: Actor = { id: 3, role: "seller" };
export const tailor: Actor = { id: 4, role: "tailor" };
export const otherTailor: Actor = { id: 5, role: "tailor" };

export const job = (over: Partial<JobRef> = {}): JobRef => ({
  id: 10,
  seller_id: seller.id,
  tailor_id: tailor.id,
  status: "open",
  price: 5_000_000,
  ...over,
});

export function checks(values: Partial<Record<CheckKey, string | null>> = {}, extra: Partial<Record<CheckKey, Partial<CheckRow>>> = {}): CheckRow[] {
  return CHECK_KEYS.map((k) => ({ ...emptyCheck(k), value: values[k] ?? null, ...(extra[k] ?? {}) }));
}

export const allPass = () =>
  checks({ materials: "all_received", ready: "ready", quality: "ok", label: "on", video: "taken", payment: "paid" });
