// Which daily reminders to send (pure), and the weekly report grouping.
import { diffDays } from "../time";
import { type CheckRow, failing, hasMaterialsIssue, hasProblem, ordered } from "./checks";

export interface OpenJob {
  id: number;
  name: string;
  install_date: string;
  price: number;
  seller_id: number;
  tailor_id: number;
  checks: CheckRow[];
}

export type ReminderKind = "mat_due_seller" | "mat_due_tailor" | "not_ready" | "install_failing";

export interface Candidate {
  kind: ReminderKind;
  jobId: number;
  userId: number;
}

export function selectReminders(jobs: OpenJob[], adminUserIds: number[], today: string): Candidate[] {
  const out: Candidate[] = [];
  const push = (c: Candidate) => {
    if (!out.some((o) => o.kind === c.kind && o.jobId === c.jobId && o.userId === c.userId)) out.push(c);
  };
  for (const j of jobs) {
    const [materials, ready] = ordered(j.checks);
    const daysToInstall = diffDays(today, j.install_date);

    // 1. Promised materials date reached and still not all received
    if (
      materials.promised_date &&
      materials.value !== "all_received" &&
      diffDays(materials.promised_date, today) >= 0
    ) {
      push({ kind: "mat_due_seller", jobId: j.id, userId: j.seller_id });
      push({ kind: "mat_due_tailor", jobId: j.id, userId: j.tailor_id });
    }

    // 2. Install in 0-2 days and curtain not ready
    if (daysToInstall >= 0 && daysToInstall <= 2 && ready.value !== "ready") {
      push({ kind: "not_ready", jobId: j.id, userId: j.tailor_id });
      push({ kind: "not_ready", jobId: j.id, userId: j.seller_id });
    }

    // 3. Install day or later with any failing check
    if (daysToInstall <= 0 && failing(j.checks).length > 0) {
      for (const adminId of adminUserIds) push({ kind: "install_failing", jobId: j.id, userId: adminId });
    }
  }
  return out;
}

export const sentKey = (c: Candidate, date: string) => `${c.kind}:${c.jobId}:${c.userId}:${date}`;

/** Removes candidates already sent on that date. */
export const dropAlreadySent = (cands: Candidate[], sent: Set<string>, date: string) =>
  cands.filter((c) => !sent.has(sentKey(c, date)));

export interface ReportSections {
  open: OpenJob[];
  attention: OpenJob[];
  materials: OpenJob[];
  problems: OpenJob[];
  unpaid: OpenJob[];
  noVideo: OpenJob[];
  noLabel: OpenJob[];
  overdue: OpenJob[];
  debt: number;
}

export function buildReport(jobs: OpenJob[], today: string): ReportSections {
  const val = (j: OpenJob, i: number) => ordered(j.checks)[i];
  const unpaid = jobs.filter((j) => val(j, 5).value !== "paid");
  const debt = unpaid.reduce((sum, j) => sum + Math.max(0, j.price - (val(j, 5).amount ?? 0)), 0);
  const score = (j: OpenJob) => {
    const overdueDays = Math.max(0, -diffDays(today, j.install_date));
    const soon = diffDays(today, j.install_date) <= 2 ? 3 : 0;
    return overdueDays * 10 + soon + failing(j.checks).length + (hasProblem(j.checks) ? 5 : 0);
  };
  const attention = jobs
    .filter((j) => failing(j.checks).length > 0 && diffDays(today, j.install_date) <= 7)
    .sort((a, b) => score(b) - score(a) || a.install_date.localeCompare(b.install_date))
    .slice(0, 10);
  return {
    open: jobs,
    attention,
    materials: jobs.filter((j) => hasMaterialsIssue(j.checks)),
    problems: jobs.filter((j) => hasProblem(j.checks)),
    unpaid,
    noVideo: jobs.filter((j) => val(j, 4).value !== "taken"),
    noLabel: jobs.filter((j) => val(j, 3).value !== "on"),
    overdue: jobs.filter((j) => diffDays(today, j.install_date) < 0),
    debt,
  };
}
