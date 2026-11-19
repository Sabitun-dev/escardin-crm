import type { InlineKeyboard } from "grammy";
import { describe, expect, it } from "vitest";
import { money, t } from "../src/i18n";
import en from "../src/locales/en";
import uz from "../src/locales/uz";
import type { Job, User } from "../src/repo";
import { addDays, diffDays, fmtDate, parseUserDate } from "../src/time";
import { cardView, listView, pickerView } from "../src/views";
import { allPass, checks } from "./helpers";

const user = (role: User["role"], id: number): User => ({
  id,
  telegram_id: 1000 + id,
  name: `U${id}`,
  role,
  language: "uz",
  is_active: true,
  is_reachable: true,
});

const job: Job = {
  id: 123456,
  name: "Test <b>job</b>",
  install_date: "2026-11-20",
  price: 4_500_000,
  seller_id: 2,
  tailor_id: 4,
  status: "open",
  created_at: new Date(),
  closed_at: null,
  closed_by: null,
  closed_with_exception: false,
  exception_reason: null,
  group_message_id: null,
  seller_name: "Seller",
  tailor_name: "Tailor",
  closed_by_name: null,
};

const allCallbacks = (kb: InlineKeyboard) =>
  kb.inline_keyboard.flat().flatMap((b) => ("callback_data" in b ? [b.callback_data] : []));

describe("texts", () => {
  it("English has every Uzbek key", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(uz).sort());
  });
  it("fills placeholders and formats so'm", () => {
    expect(t("uz", "welcome", { name: "Ali", role: "Sotuvchi" })).toBe("Xush kelibsiz, Ali! Rolingiz: Sotuvchi.");
    expect(money("uz", 4_500_000)).toBe("4 500 000 so'm");
  });
});

describe("dates", () => {
  it("reads typed dates and rolls into next year when needed", () => {
    expect(parseUserDate("25.11", "2026-11-19")).toBe("2026-11-25");
    expect(parseUserDate("5.1", "2026-12-20")).toBe("2027-01-05");
    expect(parseUserDate("10.11", "2026-11-19")).toBe("2026-11-10"); // recent past stays (bot asks to confirm)
    expect(parseUserDate("31.02", "2026-11-19")).toBeNull();
    expect(parseUserDate("hello", "2026-11-19")).toBeNull();
  });
  it("date helpers", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-11-19", "2026-11-21")).toBe(2);
    expect(fmtDate("2026-11-05")).toBe("05.11");
  });
});

describe("screens", () => {
  it("job card escapes names and shows only allowed buttons", () => {
    const tailor = cardView("uz", user("tailor", 4), job, checks(), "2026-11-19", 0);
    expect(tailor.text).toContain("Test &lt;b&gt;job&lt;/b&gt;");
    const data = allCallbacks(tailor.kb);
    expect(data).toContain("c:123456:m");
    expect(data).not.toContain("c:123456:p");
    expect(data.some((d) => d.startsWith("cl:"))).toBe(false);

    const sellerView = cardView("uz", user("seller", 2), job, allPass(), "2026-11-19", 0);
    expect(allCallbacks(sellerView.kb)).toContain("cl:123456");

    const adminView = cardView("en", user("admin", 1), job, checks(), "2026-11-19", 2);
    const adminData = allCallbacks(adminView.kb);
    expect(adminData).toEqual(expect.arrayContaining(["ce:123456", "e:123456", "cx:123456", "ph:123456"]));
  });

  it("all button data fits Telegram's 64-byte limit", () => {
    const views = [
      cardView("uz", user("admin", 1), job, checks({ materials: "incomplete" }), "2026-11-19", 3),
      pickerView("uz", job, "materials"),
      listView("uz", [{ ...job, checks: allPass() }], 40, "a", 3, "2026-11-19"),
    ];
    for (const v of views) for (const d of allCallbacks(v.kb)) expect(Buffer.byteLength(d)).toBeLessThan(64);
  });
});
