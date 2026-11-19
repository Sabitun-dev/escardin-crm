// What each person should do today (the Mini App "Bugun" screen). Pure, so it can be tested.
import { diffDays } from "../time";
import { type CheckKey, isComplete, ordered } from "./checks";
import type { Actor } from "./permissions";
import type { OpenJob } from "./reminders";

export type TaskKind =
  // tailor (steps 1–2, and fixing what SMM found)
  | "check_delivered" // seller says the rest of the materials is delivered: confirm
  | "fix_problem"
  | "check_materials"
  | "make_ready"
  | "wait_materials" // waiting for the seller (information)
  // SMM (steps 3–5)
  | "check_quality"
  | "attach_label"
  | "take_video"
  // seller (admins too, for their own jobs)
  | "bring_materials"
  | "close_job"
  // admin (step 6, dates, overview)
  | "decide_date"
  | "get_payment"
  | "overdue"
  | "problems"
  | "materials_issues";

export type Tone = "red" | "amber" | "green" | "gold" | "grey";

export interface Task {
  kind: TaskKind;
  tone: Tone;
  jobIds: number[];
  /** The check to open straight away, when the task is one step */
  step: CheckKey | null;
  /** Jobs among these that install today or are late */
  urgent: number;
  /** So'm, for money tasks */
  amount?: number;
}

const ORDER: TaskKind[] = [
  "overdue",
  "decide_date",
  "check_delivered",
  "fix_problem",
  "problems",
  "close_job",
  "bring_materials",
  "check_materials",
  "make_ready",
  "check_quality",
  "attach_label",
  "take_video",
  "get_payment",
  "materials_issues",
  "wait_materials",
];

const TONE: Record<TaskKind, Tone> = {
  overdue: "red",
  decide_date: "amber",
  check_delivered: "amber",
  fix_problem: "red",
  problems: "red",
  close_job: "green",
  bring_materials: "amber",
  check_materials: "grey",
  make_ready: "amber",
  check_quality: "grey",
  attach_label: "grey",
  get_payment: "gold",
  take_video: "grey",
  materials_issues: "amber",
  wait_materials: "grey",
};

const STEP: Partial<Record<TaskKind, CheckKey>> = {
  check_delivered: "materials",
  check_materials: "materials",
  make_ready: "ready",
  check_quality: "quality",
  fix_problem: "quality",
  attach_label: "label",
  take_video: "video",
  get_payment: "payment",
};

/** Money still owed on a job. */
export const remaining = (j: OpenJob) => {
  const p = ordered(j.checks)[5];
  return p.value === "paid" ? 0 : Math.max(0, j.price - (p.amount ?? 0));
};

export function todayTasks(me: Actor, jobs: OpenJob[], today: string): Task[] {
  const lists = new Map<TaskKind, OpenJob[]>();
  const add = (k: TaskKind, j: OpenJob) => {
    const l = lists.get(k) ?? [];
    if (!l.includes(j)) l.push(j);
    lists.set(k, l);
  };
  const sorted = [...jobs].sort((a, b) => a.install_date.localeCompare(b.install_date) || a.id - b.id);

  for (const j of sorted) {
    const [materials, ready, quality, label, video, payment] = ordered(j.checks);
    const issue = materials.value !== null && materials.value !== "all_received";
    const days = diffDays(today, j.install_date);

    if (me.role === "tailor" && j.tailor_id === me.id) {
      if (issue && materials.delivered_claimed) add("check_delivered", j);
      else if (issue) add("wait_materials", j);
      if (materials.value === null) add("check_materials", j);
      if (quality.value === "problem") add("fix_problem", j);
      if (ready.value !== "ready") add("make_ready", j);
    }

    // SMM checks every job once the curtain is ready (video also on the install day)
    if (me.role === "smm") {
      if (ready.value === "ready" && quality.value === null) add("check_quality", j);
      if (ready.value === "ready" && label.value !== "on") add("attach_label", j);
      if (video.value !== "taken" && (ready.value === "ready" || days <= 0)) add("take_video", j);
    }

    if ((me.role === "seller" || me.role === "admin") && j.seller_id === me.id) {
      if (issue && !materials.delivered_claimed) add("bring_materials", j);
      if (materials.value === null && me.role === "seller") add("check_materials", j);
      if (me.role === "seller" && isComplete(j.checks)) add("close_job", j);
    }

    if (me.role === "admin") {
      if (days < 0) add("overdue", j);
      if (j.offer_pending) add("decide_date", j);
      if (quality.value === "problem") add("problems", j);
      if (issue) add("materials_issues", j);
      if (isComplete(j.checks)) add("close_job", j);
      if (payment.value !== "paid") add("get_payment", j);
    }
  }

  const out: Task[] = [];
  for (const kind of ORDER) {
    const list = lists.get(kind);
    if (!list?.length) continue;
    const task: Task = {
      kind,
      tone: TONE[kind],
      jobIds: list.map((j) => j.id),
      step: STEP[kind] ?? null,
      urgent: list.filter((j) => diffDays(today, j.install_date) <= 0).length,
    };
    if (kind === "get_payment") task.amount = list.reduce((s, j) => s + remaining(j), 0);
    out.push(task);
  }
  return out;
}
