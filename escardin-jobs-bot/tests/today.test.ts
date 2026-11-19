import { describe, expect, it } from "vitest";
import type { OpenJob } from "../src/rules/reminders";
import { todayTasks } from "../src/rules/today";
import { admin, allPass, checks, otherSeller, otherTailor, seller, tailor } from "./helpers";

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

describe("Bugun: tasks per role", () => {
  const jobs = [
    j(1, "2026-11-19"), // new, nothing set
    j(2, "2026-11-25", checks({ materials: "incomplete" }, { materials: { delivered_claimed: true } })),
    j(3, "2026-11-18", checks({ materials: "all_received", ready: "ready", quality: "problem" })),
    j(4, "2026-11-30", allPass()),
    j(5, "2026-11-21", checks({ materials: "not_enough", ready: "ready", quality: "ok", label: "on", payment: "partly" }, { payment: { amount: 400_000 } })),
    j(6, "2026-11-20", checks(), { seller_id: otherSeller.id, tailor_id: otherTailor.id }),
  ];

  it("tailor sees only own work, most urgent first", () => {
    const tasks = todayTasks(tailor, jobs, TODAY);
    expect(kinds(tasks)).toEqual(["check_delivered", "fix_problem", "check_materials", "make_ready", "attach_label", "wait_materials"]);
    expect(tasks.find((t) => t.kind === "make_ready")!.jobIds).toEqual([1, 2]);
    expect(tasks.find((t) => t.kind === "check_delivered")).toMatchObject({ jobIds: [2], step: "materials", tone: "amber" });
    expect(tasks.flatMap((t) => t.jobIds)).not.toContain(6); // another tailor's job
  });

  it("seller sees payments, videos, materials to bring and jobs to close", () => {
    const tasks = todayTasks(seller, jobs, TODAY);
    expect(kinds(tasks)).toEqual(["close_job", "bring_materials", "get_payment", "take_video"]);
    const pay = tasks.find((t) => t.kind === "get_payment")!;
    expect(pay.jobIds).toEqual([3, 1, 5, 2]);
    expect(pay.amount).toBe(1_000_000 * 3 + 600_000);
    expect(tasks.find((t) => t.kind === "close_job")!.jobIds).toEqual([4]);
    expect(tasks.find((t) => t.kind === "bring_materials")!.jobIds).toEqual([5]); // job 2 already delivered
    expect(tasks.find((t) => t.kind === "take_video")!.jobIds).toEqual([3, 1, 5]); // ready or install day reached
  });

  it("admin sees overdue, problems, materials and the unpaid total across all jobs", () => {
    const tasks = todayTasks(admin, jobs, TODAY);
    expect(kinds(tasks)).toEqual(["overdue", "problems", "close_job", "materials_issues", "unpaid_total"]);
    expect(tasks.find((t) => t.kind === "overdue")!.jobIds).toEqual([3]);
    expect(tasks.find((t) => t.kind === "unpaid_total")!.amount).toBe(1_000_000 * 4 + 600_000);
  });

  it("admin who also sells gets seller tasks for own jobs", () => {
    const own = [j(7, "2026-11-22", checks({ ready: "ready" }), { seller_id: admin.id })];
    expect(kinds(todayTasks(admin, own, TODAY))).toEqual(["get_payment", "take_video", "unpaid_total"]);
  });

  it("nothing to do gives an empty list (happy screen)", () => {
    expect(todayTasks(tailor, [j(8, "2026-11-30", allPass())], TODAY)).toEqual([]);
    expect(todayTasks(otherSeller, jobs.slice(0, 5), TODAY)).toEqual([]);
  });

  it("counts urgent jobs (today or late)", () => {
    expect(todayTasks(tailor, jobs, TODAY).find((t) => t.kind === "make_ready")!.urgent).toBe(1);
  });
});
