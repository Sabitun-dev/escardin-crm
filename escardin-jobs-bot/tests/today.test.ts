import { describe, expect, it } from "vitest";
import type { OpenJob } from "../src/rules/reminders";
import { todayTasks } from "../src/rules/today";
import { admin, allPass, checks, otherSeller, otherTailor, seller, smm, tailor } from "./helpers";

const TODAY = "2026-11-19";
const j = (id: number, install: string, c = checks(), over: Partial<OpenJob> = {}): OpenJob => ({
  id,
  name: `Job ${id}`,
  install_date: install,
  price: 1_000_000,
  seller_id: seller.id,
  tailor_id: tailor.id,
  checks: c,
  ...over,
});
const kinds = (tasks: ReturnType<typeof todayTasks>) => tasks.map((t) => t.kind);
const ids = (tasks: ReturnType<typeof todayTasks>, kind: string) => tasks.find((t) => t.kind === kind)?.jobIds;

describe("Bugun: tasks per role", () => {
  const jobs = [
    j(1, "2026-11-19"), // new, nothing set
    j(2, "2026-11-25", checks({ materials: "incomplete" }, { materials: { delivered_claimed: true } })),
    j(3, "2026-11-18", checks({ materials: "all_received", ready: "ready", quality: "problem" })),
    j(4, "2026-11-30", allPass()),
    j(5, "2026-11-21", checks({ materials: "not_enough", ready: "ready", quality: "ok", label: "on", payment: "partly" }, { payment: { amount: 400_000 } })),
    j(6, "2026-11-20", checks(), { seller_id: otherSeller.id, tailor_id: otherTailor.id }),
  ];

  it("tailor: steps 1–2 and fixing problems, own jobs only", () => {
    const tasks = todayTasks(tailor, jobs, TODAY);
    expect(kinds(tasks)).toEqual(["check_delivered", "fix_problem", "check_materials", "make_ready", "wait_materials"]);
    expect(ids(tasks, "make_ready")).toEqual([1, 2]);
    expect(tasks.find((t) => t.kind === "check_delivered")).toMatchObject({ jobIds: [2], step: "materials", tone: "amber" });
    expect(tasks.flatMap((t) => t.jobIds)).not.toContain(6); // another tailor's job
  });

  it("SMM: quality, label and video on every job once the curtain is ready", () => {
    const readyOther = j(7, "2026-11-24", checks({ materials: "all_received", ready: "ready" }), { seller_id: otherSeller.id, tailor_id: otherTailor.id });
    const tasks = todayTasks(smm, [...jobs, readyOther], TODAY);
    expect(kinds(tasks)).toEqual(["check_quality", "attach_label", "take_video"]);
    expect(ids(tasks, "check_quality")).toEqual([7]); // any seller's job
    expect(ids(tasks, "attach_label")).toEqual([3, 7]);
    expect(ids(tasks, "take_video")).toEqual([3, 1, 5, 7]); // ready, or install day reached; job 6 not ready yet
  });

  it("seller: materials to check or bring, and jobs to close", () => {
    const tasks = todayTasks(seller, jobs, TODAY);
    expect(kinds(tasks)).toEqual(["close_job", "bring_materials", "check_materials"]);
    expect(ids(tasks, "close_job")).toEqual([4]);
    expect(ids(tasks, "bring_materials")).toEqual([5]); // job 2 already delivered
    expect(ids(tasks, "check_materials")).toEqual([1]);
  });

  it("admin: overdue, date suggestions, problems, payments across all jobs", () => {
    const withOffer = [...jobs.slice(0, 5), { ...jobs[5]!, offer_pending: true }];
    const tasks = todayTasks(admin, withOffer, TODAY);
    expect(kinds(tasks)).toEqual(["overdue", "decide_date", "problems", "close_job", "get_payment", "materials_issues"]);
    expect(ids(tasks, "decide_date")).toEqual([6]);
    expect(tasks.find((t) => t.kind === "get_payment")).toMatchObject({ step: "payment", amount: 1_000_000 * 4 + 600_000 });
  });

  it("nothing to do gives an empty list (happy screen)", () => {
    expect(todayTasks(tailor, [j(8, "2026-11-30", allPass())], TODAY)).toEqual([]);
    expect(todayTasks(otherSeller, jobs.slice(0, 5), TODAY)).toEqual([]);
    expect(todayTasks(smm, [j(9, "2026-11-30", allPass())], TODAY)).toEqual([]);
  });

  it("counts urgent jobs (today or late)", () => {
    expect(todayTasks(tailor, jobs, TODAY).find((t) => t.kind === "make_ready")!.urgent).toBe(1);
  });
});
