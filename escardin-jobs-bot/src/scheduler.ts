// Runs every 15 minutes (Netlify scheduled function). Each daily/weekly task runs once
// per day after its time, and every reminder is recorded so nobody gets the same one twice.
import type { Api } from "grammy";
import { storeBackup } from "./backup";
import { cfg } from "./config";
import { type Lang, esc, t } from "./i18n";
import { alertAdmins, describe, notifyMany, sendTo, sleep } from "./notify";
import {
  type User,
  activeUsers,
  claimNotification,
  cleanupOld,
  hasRun,
  markRun,
  openJobsWithChecks,
  releaseNotification,
} from "./repo";
import { failing, ordered } from "./rules/checks";
import { buildReport, selectReminders } from "./rules/reminders";
import { localParts } from "./time";
import { chunks, dueLabel, missingList, openKb, reportText, valueName } from "./views";
import { fmtDate } from "./time";

export async function runScheduled(api: Api, now = new Date()) {
  const { date, hhmm, weekday } = localParts(now);
  const tasks: [string, boolean, () => Promise<void>][] = [
    ["daily", hhmm >= cfg.dailyTime(), () => runDailyReminders(api, date)],
    ["backup", hhmm >= cfg.dailyTime(), async () => void (await storeBackup(date))],
    ["weekly", weekday === cfg.weeklyDay() && hhmm >= cfg.weeklyTime(), () => sendReport(api, date)],
    ["cleanup", hhmm >= cfg.dailyTime(), () => cleanupOld(date)],
  ];
  for (const [kind, due, fn] of tasks) {
    if (!due || (await hasRun(kind, date))) continue;
    try {
      await fn();
      await markRun(kind, date);
    } catch (e) {
      console.error(`${kind} failed:`, describe(e));
      await alertAdmins(api, e);
    }
  }
}

export async function runDailyReminders(api: Api, today: string) {
  const jobs = await openJobsWithChecks();
  const users = await activeUsers();
  const byId = new Map<number, User>(users.map((u) => [u.id, u]));
  const admins = users.filter((u) => u.role === "admin");
  const candidates = selectReminders(jobs, admins.map((a) => a.id), today);

  for (const c of candidates) {
    const user = byId.get(c.userId);
    const job = jobs.find((j) => j.id === c.jobId);
    if (!user || !job) continue;
    if (!(await claimNotification(c.kind, c.jobId, c.userId, today))) continue; // already sent today

    const lang: Lang = user.language;
    const m = ordered(job.checks)[0];
    const base = { name: esc(job.name), date: fmtDate(job.install_date), due: dueLabel(lang, job.install_date, today) };
    let text: string;
    if (c.kind === "mat_due_seller") {
      text = t(lang, "rem_mat_seller", {
        ...base,
        date: fmtDate(m.promised_date),
        issue: valueName(lang, "materials", m.value),
        note: esc(m.note ?? ""),
      });
    } else if (c.kind === "mat_due_tailor") {
      text = t(lang, "rem_mat_tailor", { ...base, seller: esc(job.seller_name) });
    } else if (c.kind === "not_ready") {
      text = t(lang, "rem_not_ready", base);
    } else {
      text = t(lang, "rem_failing", { ...base, list: missingList(lang, failing(job.checks)) });
    }
    const ok = await sendTo(api, user, { text, kb: openKb(lang, job.id) });
    // Not delivered for a temporary reason: free the slot so the next run tries again
    if (!ok && user.is_reachable) await releaseNotification(c.kind, c.jobId, c.userId, today);
    await sleep(40);
  }
}

export async function reportFor(lang: Lang, today: string): Promise<string[]> {
  const jobs = await openJobsWithChecks();
  return chunks(reportText(lang, buildReport(jobs, today), today));
}

export async function sendReport(api: Api, today: string) {
  const admins = await activeUsers("admin");
  const cache = new Map<Lang, string[]>();
  for (const a of admins) {
    if (!cache.has(a.language)) cache.set(a.language, await reportFor(a.language, today));
    for (const part of cache.get(a.language)!) {
      await notifyMany(api, [a], () => ({ text: part }));
    }
  }
}
