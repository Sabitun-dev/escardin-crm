import { describe, expect, it } from "vitest";
import { type OpenJob, buildReport, dropAlreadySent, selectReminders, sentKey } from "../src/rules/reminders";
import { allPass, checks } from "./helpers";

const TODAY = "2026-11-19";
const ADMINS = [1, 9];

const mk = (id: number, install: string, c = checks(), over: Partial<OpenJob> = {}): OpenJob => ({
  id,
  name: `Job ${id}`,
  install_date: install,
  price: 1_000_000,
  seller_id: 2,
  tailor_id: 4,
  checks: c,
  ...over,
});

describe("daily reminder selection", () => {
  it("promised materials date reached: seller reminded, tailor told", () => {
    const c = checks({ materials: "incomplete" }, { materials: { promised_date: TODAY, note: "x" } });
    const r = selectReminders([mk(1, "2026-12-10", c)], ADMINS, TODAY);
    expect(r).toEqual([
      { kind: "mat_due_seller", jobId: 1, userId: 2 },
      { kind: "mat_due_tailor", jobId: 1, userId: 4 },
    ]);
  });

  it("promised date in the future: no reminder", () => {
    const c = checks({ materials: "incomplete" }, { materials: { promised_date: "2026-11-20" } });
    expect(selectReminders([mk(1, "2026-12-10", c)], ADMINS, TODAY)).toEqual([]);
  });

  it("install in 0-2 days and not ready: tailor and seller", () => {
    const r = selectReminders([mk(1, "2026-11-21")], ADMINS, TODAY);
    expect(r).toEqual([
      { kind: "not_ready", jobId: 1, userId: 4 },
      { kind: "not_ready", jobId: 1, userId: 2 },
    ]);
    expect(selectReminders([mk(2, "2026-11-22")], ADMINS, TODAY)).toEqual([]);
  });

  it("install day or later with failing checks: every admin", () => {
    const c = allPass();
    c[5].value = "partly";
    const r = selectReminders([mk(1, "2026-11-17", c)], ADMINS, TODAY);
    expect(r).toEqual([
      { kind: "install_failing", jobId: 1, userId: 1 },
      { kind: "install_failing", jobId: 1, userId: 9 },
    ]);
  });

  it("everything passing: nothing to send", () => {
    expect(selectReminders([mk(1, TODAY, allPass())], ADMINS, TODAY)).toEqual([]);
  });
});

describe("duplicate prevention", () => {
  it("drops reminders already sent today, keeps tomorrow's", () => {
    const cands = selectReminders([mk(1, "2026-11-20")], ADMINS, TODAY);
    const sent = new Set(cands.map((c) => sentKey(c, TODAY)));
    expect(dropAlreadySent(cands, sent, TODAY)).toEqual([]);
    expect(dropAlreadySent(cands, sent, "2026-11-20")).toHaveLength(cands.length);
  });

  it("seller who is also the tailor gets one not-ready reminder", () => {
    const r = selectReminders([mk(1, TODAY, checks(), { seller_id: 4, tailor_id: 4 })], [], TODAY);
    expect(r.filter((x) => x.kind === "not_ready")).toHaveLength(1);
  });
});

describe("weekly report", () => {
  it("groups jobs and sums the unpaid balance", () => {
    const paidPart = checks({ payment: "partly" }, { payment: { amount: 400_000 } });
    const r = buildReport([mk(1, "2026-11-10", paidPart), mk(2, "2026-11-30", allPass())], TODAY);
    expect(r.open).toHaveLength(2);
    expect(r.overdue.map((j) => j.id)).toEqual([1]);
    expect(r.unpaid.map((j) => j.id)).toEqual([1]);
    expect(r.debt).toBe(600_000);
    expect(r.attention[0].id).toBe(1);
  });
});
