import { describe, expect, it } from "vitest";
import appEn from "../src/locales/app-en";
import appUz from "../src/locales/app-uz";

describe("Mini App texts", () => {
  it("English has every Uzbek key, and no text is empty", () => {
    expect(Object.keys(appEn).sort()).toEqual(Object.keys(appUz).sort());
    for (const v of [...Object.values(appUz), ...Object.values(appEn)]) expect(v.trim()).not.toBe("");
  });
  it("uses the same {placeholders} in both languages", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(appUz) as (keyof typeof appUz)[]) expect(ph(appEn[k]), k).toBe(ph(appUz[k]));
  });
});
