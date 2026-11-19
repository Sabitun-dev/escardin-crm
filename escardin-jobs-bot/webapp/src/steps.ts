// How each of the six checks looks and who may change it. The rules themselves come from
// src/rules/ (the same code the server runs), so the app never disagrees with the bot.
import type { AppCheck, AppJob, AppUser } from "../../src/app-types";
import { CHECKS, CHECK_KEYS, type CheckKey, type CheckRow, passes } from "../../src/rules/checks";
import * as perm from "../../src/rules/permissions";
import { type AppKey, t } from "./i18n";
import type { IconName } from "./ui/Icon";

export { CHECKS, CHECK_KEYS };
export type { CheckKey };

export type StepState = "done" | "paid" | "attention" | "blocking" | "notset";

export const STEP_ICON: Record<CheckKey, IconName> = {
  materials: "fabric",
  ready: "needle",
  quality: "sparkle",
  label: "tag",
  video: "video",
  payment: "coin",
};

export const checkName = (k: CheckKey) => t(`ck_${k}` as AppKey);
export const checkNum = (k: CheckKey) => CHECK_KEYS.indexOf(k) + 1;
export const valueName = (k: CheckKey, v: string | null) => (v ? t(`v_${k}_${v}` as AppKey) : t("not_set"));

export function stepState(c: Pick<AppCheck, "key" | "value">): StepState {
  if (c.value === null) return "notset";
  if (passes(c)) return c.key === "payment" ? "paid" : "done";
  if (c.key === "quality" || (c.key === "payment" && c.value === "unpaid")) return "blocking";
  return "attention";
}

/** Status icon that goes with the colour, so nothing depends on colour alone. */
export const STATE_ICON: Record<StepState, IconName> = {
  done: "check",
  paid: "coin",
  attention: "alert",
  blocking: "x",
  notset: "dot",
};

const rows = (j: AppJob) => j.checks as unknown as CheckRow[];
export const progressOf = (j: AppJob) => j.checks.filter((c) => passes(c)).length;
export const checkOf = (j: AppJob, k: CheckKey) => j.checks.find((c) => c.key === k)!;
export const missingOf = (j: AppJob) => j.checks.filter((c) => !passes(c)).map((c) => c.key);

export const canSet = (me: AppUser, j: AppJob, k: CheckKey) => perm.canSetCheck(me, j, k);
export const canCreate = (me: AppUser) => perm.canCreateJob(me);
export const canEdit = (me: AppUser, j: AppJob) => perm.canEditJob(me, j);
export const canCancel = (me: AppUser, j: AppJob) => perm.canCancelJob(me, j);
export const canManage = (me: AppUser) => perm.canManage(me);
export const isAdmin = (me: AppUser) => perm.isAdmin(me);
export const closeDecision = (me: AppUser, j: AppJob) => perm.canClose(me, j, rows(j));
export function canClaim(me: AppUser, j: AppJob) {
  const m = checkOf(j, "materials");
  return perm.canClaimDelivered(me, j) && m.value !== null && m.value !== "all_received" && !m.delivered_claimed;
}

/** The first step this person can still do on this job. */
export function nextStepFor(me: AppUser, j: AppJob): CheckKey | null {
  if (j.status !== "open") return null;
  return CHECK_KEYS.find((k) => !passes(checkOf(j, k)) && canSet(me, j, k)) ?? null;
}

/** "Bu bosqichni SMM xodimi belgilaydi" — shown when someone taps a step that is not theirs */
export const lockedText = (k: CheckKey) => t(`locked_${CHECKS[k].setBy}` as AppKey);
/** "SMM xodimi belgilaydi" — under a step nobody has set yet */
export const whoText = (k: CheckKey) => t(`who_${CHECKS[k].setBy}` as AppKey);
export const canOffer = (me: AppUser, j: AppJob) => perm.canProposeDate(me, j);
export const canDecide = (me: AppUser) => perm.canDecideDate(me);
