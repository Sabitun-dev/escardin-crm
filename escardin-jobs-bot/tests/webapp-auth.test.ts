import { describe, expect, it } from "vitest";
import { signInitData, validateInitData } from "../src/webapp-auth";

const TOKEN = "123456:TEST-token";
const now = 1_800_000_000;
const fields = (authDate = now - 60) => ({
  auth_date: String(authDate),
  query_id: "AAE-test",
  user: JSON.stringify({ id: 777, first_name: "Ali", language_code: "uz" }),
});

describe("Mini App sign-in (initData)", () => {
  it("accepts data signed with our bot token", () => {
    const r = validateInitData(signInitData(fields(), TOKEN), TOKEN, now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.id).toBe(777);
  });

  it("rejects changed data (someone pretending to be another user)", () => {
    const signed = signInitData(fields(), TOKEN);
    const tampered = signed.replace(encodeURIComponent('"id":777'), encodeURIComponent('"id":778'));
    expect(tampered).not.toBe(signed);
    expect(validateInitData(tampered, TOKEN, now)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects data signed with another bot's token", () => {
    expect(validateInitData(signInitData(fields(), "999:OTHER"), TOKEN, now)).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects data older than 24 hours", () => {
    const old = signInitData(fields(now - 24 * 3600 - 1), TOKEN);
    expect(validateInitData(old, TOKEN, now)).toEqual({ ok: false, reason: "expired" });
    const fresh = signInitData(fields(now - 24 * 3600 + 5), TOKEN);
    expect(validateInitData(fresh, TOKEN, now).ok).toBe(true);
  });

  it("rejects missing data or a missing hash", () => {
    expect(validateInitData("", TOKEN, now)).toEqual({ ok: false, reason: "missing" });
    expect(validateInitData(new URLSearchParams(fields()).toString(), TOKEN, now)).toEqual({ ok: false, reason: "bad_hash" });
  });
});
