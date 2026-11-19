// Who may do what. Every handler calls these on the server, buttons are only a convenience.
import {
  CHECKS,
  type CheckKey,
  type CheckRow,
  failing,
  isComplete,
  needsAmount,
  needsNote,
  needsPhoto,
  needsPromisedDate,
  paidAmount,
  validPartlyAmount,
} from "./checks";

export type Role = "seller" | "tailor" | "smm" | "admin";
export const ROLES: Role[] = ["seller", "tailor", "smm", "admin"];
export type JobStatus = "open" | "done" | "cancelled";

export interface Actor {
  id: number;
  role: Role;
}

export interface JobRef {
  id: number;
  seller_id: number;
  tailor_id: number;
  status: JobStatus;
  price: number;
}

export const isAdmin = (a: Actor) => a.role === "admin";
const isOwnSeller = (a: Actor, j: JobRef) => a.role === "seller" && j.seller_id === a.id;
const isOwnTailor = (a: Actor, j: JobRef) => a.role === "tailor" && j.tailor_id === a.id;

export const canCreateJob = (a: Actor) => a.role === "seller" || a.role === "admin";
export const canEditJob = (a: Actor, j: JobRef) => j.status === "open" && (isAdmin(a) || isOwnSeller(a, j));
export const canCancelJob = (a: Actor, j: JobRef) => j.status === "open" && isAdmin(a);
export const canManage = (a: Actor) => isAdmin(a);

export function canSetCheck(a: Actor, j: JobRef, key: CheckKey): boolean {
  if (j.status !== "open") return false;
  if (isAdmin(a)) return true;
  const def = CHECKS[key];
  if (def.setBy === "tailor") return isOwnTailor(a, j) || (!!def.alsoSeller && isOwnSeller(a, j));
  if (def.setBy === "smm") return a.role === "smm";
  return false; // payment: admins only
}

/** The job's tailor may suggest a new install date; an admin approves or rejects it. */
export const canProposeDate = (a: Actor, j: JobRef) => j.status === "open" && isOwnTailor(a, j);
export const canDecideDate = (a: Actor) => isAdmin(a);

export const canClaimDelivered =(a: Actor, j: JobRef) => j.status === "open" && (isAdmin(a) || isOwnSeller(a, j));

export type CloseDecision =
  | { ok: true; exception: boolean; missing: CheckKey[] }
  | { ok: false; reason: "not_open" | "forbidden" | "incomplete"; missing: CheckKey[] };

/** Seller closes own job only at 6/6. Admin closes any open job; below 6/6 it is an exception. */
export function canClose(a: Actor, j: JobRef, rows: CheckRow[]): CloseDecision {
  const missing = failing(rows);
  if (j.status !== "open") return { ok: false, reason: "not_open", missing };
  if (isAdmin(a)) return { ok: true, exception: !isComplete(rows), missing };
  if (isOwnSeller(a, j)) {
    return isComplete(rows) ? { ok: true, exception: false, missing } : { ok: false, reason: "incomplete", missing };
  }
  return { ok: false, reason: "forbidden", missing };
}

// ---- Planning a check change (pure, so it can be tested) ----

export type Audience = "seller" | "tailor" | "smm" | "admins";

export interface CheckInput {
  note?: string | null;
  promisedDate?: string | null;
  photoFileId?: string | null;
  amount?: number | null;
}

export type CheckPlan =
  | {
      ok: true;
      changed: boolean;
      next: Pick<CheckRow, "value" | "note" | "promised_date" | "delivered_claimed" | "amount">;
      notify: Audience[];
    }
  | { ok: false; error: "not_open" | "forbidden" | "bad_value" | "note_required" | "photo_required" | "amount_required" };

export function planCheckSet(
  a: Actor,
  j: JobRef,
  prev: CheckRow,
  value: string,
  input: CheckInput = {},
): CheckPlan {
  const key = prev.key;
  if (j.status !== "open") return { ok: false, error: "not_open" };
  if (!canSetCheck(a, j, key)) return { ok: false, error: "forbidden" };
  if (!CHECKS[key].values.includes(value)) return { ok: false, error: "bad_value" };

  const note = input.note?.trim() || null;
  if (needsNote(key, value) && !note) return { ok: false, error: "note_required" };
  if (needsPhoto(key, value) && !input.photoFileId) return { ok: false, error: "photo_required" };
  if (needsAmount(key, value) && !(input.amount != null && validPartlyAmount(input.amount, j.price))) {
    return { ok: false, error: "amount_required" };
  }

  const next = {
    value,
    note: needsNote(key, value) ? note : null,
    promised_date: needsPromisedDate(key, value) ? (input.promisedDate ?? null) : null,
    delivered_claimed: false,
    amount: key === "payment" ? paidAmount(value, j.price, input.amount) : null,
  };

  const changed =
    prev.value !== next.value ||
    (prev.note ?? null) !== next.note ||
    (prev.promised_date ?? null) !== next.promised_date ||
    (prev.amount ?? null) !== next.amount ||
    prev.delivered_claimed !== next.delivered_claimed ||
    !!input.photoFileId;

  // Materials issue: the seller must bring the rest. Quality problem (found by SMM): the tailor must fix it.
  const notify: Audience[] =
    !changed || !needsNote(key, value) ? [] : key === "quality" ? ["tailor", "seller", "admins"] : ["seller", "admins"];
  return { ok: true, changed, next, notify };
}

export type ClaimPlan =
  | { ok: true; changed: boolean; notify: Audience[] }
  | { ok: false; error: "not_open" | "forbidden" | "no_issue" };

/** Seller says "I delivered the rest": only when materials has an open issue. */
export function planClaimDelivered(a: Actor, j: JobRef, materials: CheckRow): ClaimPlan {
  if (j.status !== "open") return { ok: false, error: "not_open" };
  if (!canClaimDelivered(a, j)) return { ok: false, error: "forbidden" };
  if (materials.value === null || materials.value === "all_received") return { ok: false, error: "no_issue" };
  if (materials.delivered_claimed) return { ok: true, changed: false, notify: [] };
  return { ok: true, changed: true, notify: ["tailor"] };
}
