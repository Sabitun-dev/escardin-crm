import { describe, expect, it } from "vitest";
import { type CheckKey, failing, isComplete, parseMoney, passes, progress } from "../src/rules/checks";
import { planCheckSet, planClaimDelivered } from "../src/rules/permissions";
import { admin, allPass, checks, job, seller, smm, tailor } from "./helpers";

const row = (key: CheckKey, value: string | null = null) => checks({ [key]: value }).find((r) => r.key === key)!;

describe("six checks", () => {
  it("each check passes only on its pass value", () => {
    const rows = allPass();
    expect(rows.every(passes)).toBe(true);
    expect(passes({ key: "payment", value: "partly" })).toBe(false);
    expect(passes({ key: "materials", value: "not_enough" })).toBe(false);
    expect(passes({ key: "ready", value: null })).toBe(false);
  });

  it("progress and failing list keep the fixed order", () => {
    const rows = checks({ materials: "all_received", label: "on", payment: "unpaid" });
    expect(progress(rows)).toBe(2);
    expect(failing(rows)).toEqual(["ready", "quality", "video", "payment"]);
    expect(isComplete(allPass())).toBe(true);
  });

  it("parses money typed in different ways", () => {
    expect(parseMoney("4500000")).toBe(4_500_000);
    expect(parseMoney("4 500 000 so'm")).toBe(4_500_000);
    expect(parseMoney("4.500.000")).toBe(4_500_000);
    expect(parseMoney("abc")).toBeNull();
  });
});

describe("setting a check", () => {
  it("simple value saves without a note", () => {
    const p = planCheckSet(tailor, job(), row("ready"), "ready");
    expect(p).toMatchObject({ ok: true, changed: true, notify: [] });
  });

  it("same value twice is not a change (double tap)", () => {
    const p = planCheckSet(tailor, job(), row("ready", "ready"), "ready");
    expect(p).toMatchObject({ ok: true, changed: false });
  });

  it("rejects people without permission on the server", () => {
    expect(planCheckSet(seller, job(), row("ready"), "ready")).toMatchObject({ ok: false, error: "forbidden" });
    expect(planCheckSet(tailor, job(), row("payment"), "paid")).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("rejects unknown values and closed jobs", () => {
    expect(planCheckSet(tailor, job(), row("ready"), "maybe")).toMatchObject({ ok: false, error: "bad_value" });
    expect(planCheckSet(admin, job({ status: "done" }), row("ready"), "ready")).toMatchObject({ ok: false, error: "not_open" });
  });

  it("problem (found by SMM) needs a note and a photo, and tells the tailor, seller and admins", () => {
    expect(planCheckSet(smm, job(), row("quality"), "problem")).toMatchObject({ ok: false, error: "note_required" });
    expect(planCheckSet(smm, job(), row("quality"), "problem", { note: "Torn" })).toMatchObject({ ok: false, error: "photo_required" });
    const p = planCheckSet(smm, job(), row("quality"), "problem", { note: "Torn", photoFileId: "F1" });
    expect(p).toMatchObject({ ok: true, changed: true, notify: ["tailor", "seller", "admins"], next: { note: "Torn" } });
  });

  it("payment amounts: paid = price, unpaid = 0, partly needs a valid amount", () => {
    expect(planCheckSet(admin, job(), row("payment"), "paid")).toMatchObject({ ok: true, next: { amount: 5_000_000 } });
    expect(planCheckSet(admin, job(), row("payment"), "unpaid")).toMatchObject({ ok: true, next: { amount: 0 } });
    expect(planCheckSet(admin, job(), row("payment"), "partly")).toMatchObject({ ok: false, error: "amount_required" });
    expect(planCheckSet(admin, job(), row("payment"), "partly", { amount: 5_000_000 })).toMatchObject({ ok: false });
    expect(planCheckSet(admin, job(), row("payment"), "partly", { amount: 2_000_000 })).toMatchObject({
      ok: true,
      next: { amount: 2_000_000 },
    });
  });
});

describe("materials flow", () => {
  it("an issue needs a note, keeps the promised date and tells seller and admins", () => {
    expect(planCheckSet(tailor, job(), row("materials"), "incomplete")).toMatchObject({ ok: false, error: "note_required" });
    const p = planCheckSet(tailor, job(), row("materials"), "incomplete", { note: "Tulle missing", promisedDate: "2026-11-20" });
    expect(p).toMatchObject({
      ok: true,
      notify: ["seller", "admins"],
      next: { value: "incomplete", note: "Tulle missing", promised_date: "2026-11-20", delivered_claimed: false },
    });
  });

  it("own seller, tailor and admin can set materials; another tailor cannot", () => {
    expect(planCheckSet(seller, job(), row("materials", "incomplete"), "all_received")).toMatchObject({ ok: true });
    expect(planCheckSet(seller, job({ seller_id: 99 }), row("materials", "incomplete"), "all_received")).toMatchObject({ ok: false, error: "forbidden" });
    expect(planCheckSet(smm, job(), row("materials"), "all_received")).toMatchObject({ ok: false, error: "forbidden" });
    expect(planCheckSet(tailor, job(), row("materials", "incomplete"), "all_received")).toMatchObject({ ok: true });
    expect(planCheckSet(admin, job(), row("materials", "incomplete"), "all_received")).toMatchObject({ ok: true });
  });

  it("All received clears the note, date and delivered flag", () => {
    const prev = { ...row("materials", "incomplete"), note: "x", promised_date: "2026-11-20", delivered_claimed: true };
    const p = planCheckSet(tailor, job(), prev, "all_received");
    expect(p).toMatchObject({ ok: true, changed: true, notify: [], next: { note: null, promised_date: null, delivered_claimed: false } });
  });

  it("seller says delivered: tailor is asked to check, only once", () => {
    const issue = row("materials", "not_enough");
    expect(planClaimDelivered(seller, job(), issue)).toEqual({ ok: true, changed: true, notify: ["tailor"] });
    expect(planClaimDelivered(seller, job(), { ...issue, delivered_claimed: true })).toEqual({ ok: true, changed: false, notify: [] });
    expect(planClaimDelivered(tailor, job(), issue)).toMatchObject({ ok: false, error: "forbidden" });
    expect(planClaimDelivered(seller, job(), row("materials", "all_received"))).toMatchObject({ ok: false, error: "no_issue" });
  });
});
