import { describe, expect, it } from "vitest";
import { CHECK_KEYS } from "../src/rules/checks";
import {
  canCancelJob,
  canClaimDelivered,
  canClose,
  canCreateJob,
  canEditJob,
  canManage,
  canDecideDate,
  canProposeDate,
  canSetCheck,
} from "../src/rules/permissions";
import { admin, allPass, checks, job, otherSeller, otherTailor, seller, smm, tailor } from "./helpers";

describe("permissions table", () => {
  it("create job: seller and admin only", () => {
    expect(canCreateJob(seller)).toBe(true);
    expect(canCreateJob(admin)).toBe(true);
    expect(canCreateJob(tailor)).toBe(false);
  });

  it("edit job: own seller or any admin, only while open", () => {
    expect(canEditJob(seller, job())).toBe(true);
    expect(canEditJob(otherSeller, job())).toBe(false);
    expect(canEditJob(tailor, job())).toBe(false);
    expect(canEditJob(admin, job())).toBe(true);
    expect(canEditJob(admin, job({ status: "done" }))).toBe(false);
  });

  it("cancel job: admin only", () => {
    expect(canCancelJob(admin, job())).toBe(true);
    expect(canCancelJob(seller, job())).toBe(false);
    expect(canCancelJob(tailor, job())).toBe(false);
    expect(canCancelJob(admin, job({ status: "cancelled" }))).toBe(false);
  });

  it("1 materials: own tailor, own seller or admin", () => {
    expect(canSetCheck(tailor, job(), "materials")).toBe(true);
    expect(canSetCheck(seller, job(), "materials")).toBe(true);
    expect(canSetCheck(admin, job(), "materials")).toBe(true);
    expect(canSetCheck(otherTailor, job(), "materials")).toBe(false);
    expect(canSetCheck(otherSeller, job(), "materials")).toBe(false);
    expect(canSetCheck(smm, job(), "materials")).toBe(false);
  });

  it("2 ready: own tailor or admin", () => {
    expect(canSetCheck(tailor, job(), "ready")).toBe(true);
    expect(canSetCheck(admin, job(), "ready")).toBe(true);
    for (const a of [otherTailor, seller, smm]) expect(canSetCheck(a, job(), "ready")).toBe(false);
  });

  it("3 quality, 4 label, 5 video: any SMM person or admin", () => {
    for (const k of ["quality", "label", "video"] as const) {
      expect(canSetCheck(smm, job(), k)).toBe(true);
      expect(canSetCheck(smm, job({ seller_id: 77, tailor_id: 88 }), k)).toBe(true);
      expect(canSetCheck(admin, job(), k)).toBe(true);
      for (const a of [tailor, seller]) expect(canSetCheck(a, job(), k)).toBe(false);
    }
  });

  it("6 payment: admin only", () => {
    expect(canSetCheck(admin, job(), "payment")).toBe(true);
    for (const a of [seller, tailor, smm]) expect(canSetCheck(a, job(), "payment")).toBe(false);
  });

  it("new install date: own tailor suggests, admin decides", () => {
    expect(canProposeDate(tailor, job())).toBe(true);
    for (const a of [otherTailor, seller, smm, admin]) expect(canProposeDate(a, job())).toBe(false);
    expect(canProposeDate(tailor, job({ status: "done" }))).toBe(false);
    expect(canDecideDate(admin)).toBe(true);
    for (const a of [seller, tailor, smm]) expect(canDecideDate(a)).toBe(false);
  });

  it("nobody sets checks on a closed job", () => {
    for (const k of CHECK_KEYS) expect(canSetCheck(admin, job({ status: "done" }), k)).toBe(false);
  });

  it("I delivered the rest: own seller or admin", () => {
    expect(canClaimDelivered(seller, job())).toBe(true);
    expect(canClaimDelivered(otherSeller, job())).toBe(false);
    expect(canClaimDelivered(tailor, job())).toBe(false);
    expect(canClaimDelivered(admin, job())).toBe(true);
  });

  it("manage users, reports, backups: admin only", () => {
    expect(canManage(admin)).toBe(true);
    expect(canManage(seller)).toBe(false);
    expect(canManage(tailor)).toBe(false);
  });
});

describe("close rule", () => {
  it("seller closes own job only at 6/6", () => {
    expect(canClose(seller, job(), allPass())).toMatchObject({ ok: true, exception: false });
    const five = allPass();
    five[5].value = "partly";
    expect(canClose(seller, job(), five)).toMatchObject({ ok: false, reason: "incomplete", missing: ["payment"] });
  });

  it("other seller and tailor cannot close", () => {
    expect(canClose(otherSeller, job(), allPass())).toMatchObject({ ok: false, reason: "forbidden" });
    expect(canClose(tailor, job(), allPass())).toMatchObject({ ok: false, reason: "forbidden" });
    expect(canClose(smm, job(), allPass())).toMatchObject({ ok: false, reason: "forbidden" });
  });

  it("admin closes at 6/6 normally, below 6/6 as exception", () => {
    expect(canClose(admin, job(), allPass())).toMatchObject({ ok: true, exception: false });
    expect(canClose(admin, job(), checks())).toMatchObject({ ok: true, exception: true });
  });

  it("closed job cannot be closed again", () => {
    expect(canClose(admin, job({ status: "done" }), allPass())).toMatchObject({ ok: false, reason: "not_open" });
  });
});
