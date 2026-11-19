// The six checks every job goes through, and the pure rules about them.

export const CHECK_KEYS = ["materials", "ready", "quality", "label", "video", "payment"] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];

export interface CheckDef {
  short: string; // one letter for button data
  setBy: "tailor" | "seller";
  values: readonly string[];
  pass: string;
}

export const CHECKS: Record<CheckKey, CheckDef> = {
  materials: {
    short: "m",
    setBy: "tailor",
    values: ["all_received", "incomplete", "wrong_item", "not_enough", "bad_quality", "other"],
    pass: "all_received",
  },
  ready: { short: "r", setBy: "tailor", values: ["ready", "not_ready"], pass: "ready" },
  quality: { short: "q", setBy: "tailor", values: ["ok", "problem"], pass: "ok" },
  label: { short: "l", setBy: "tailor", values: ["on", "off"], pass: "on" },
  video: { short: "v", setBy: "seller", values: ["taken", "none"], pass: "taken" },
  payment: { short: "p", setBy: "seller", values: ["paid", "partly", "unpaid"], pass: "paid" },
};

export const keyFromShort = (s: string): CheckKey | undefined =>
  CHECK_KEYS.find((k) => CHECKS[k].short === s);

export interface CheckRow {
  key: CheckKey;
  value: string | null;
  note: string | null;
  promised_date: string | null;
  delivered_claimed: boolean;
  amount: number | null;
  updated_by: number | null;
  updated_at: Date | null;
  updated_by_name?: string | null;
}

export const emptyCheck = (key: CheckKey): CheckRow => ({
  key,
  value: null,
  note: null,
  promised_date: null,
  delivered_claimed: false,
  amount: null,
  updated_by: null,
  updated_at: null,
});

export const passes = (row: Pick<CheckRow, "key" | "value">) => row.value === CHECKS[row.key].pass;

/** Rows in the fixed order; missing ones are "not set". */
export function ordered(rows: CheckRow[]): CheckRow[] {
  return CHECK_KEYS.map((k) => rows.find((r) => r.key === k) ?? emptyCheck(k));
}

export const progress = (rows: CheckRow[]) => ordered(rows).filter(passes).length;
export const failing = (rows: CheckRow[]): CheckKey[] => ordered(rows).filter((r) => !passes(r)).map((r) => r.key);
export const isComplete = (rows: CheckRow[]) => progress(rows) === CHECK_KEYS.length;

export const needsNote = (key: CheckKey, value: string) =>
  (key === "materials" && value !== "all_received") || (key === "quality" && value === "problem");
export const needsPromisedDate = (key: CheckKey, value: string) => key === "materials" && value !== "all_received";
export const needsPhoto = (key: CheckKey, value: string) => key === "quality" && value === "problem";
export const needsAmount = (key: CheckKey, value: string) => key === "payment" && value === "partly";

export const hasMaterialsIssue = (rows: CheckRow[]) => {
  const m = ordered(rows)[0];
  return m.value !== null && m.value !== "all_received";
};
export const hasProblem = (rows: CheckRow[]) => ordered(rows)[2].value === "problem";

/** Paid amount in so'm for a payment value. */
export function paidAmount(value: string | null, price: number, typed?: number | null): number | null {
  if (value === "paid") return price;
  if (value === "unpaid") return 0;
  if (value === "partly") return typed ?? null;
  return null;
}

export const validPartlyAmount = (amount: number, price: number) =>
  Number.isFinite(amount) && amount > 0 && amount < price;

/** "4 500 000" style input -> number, or null. */
export function parseMoney(text: string): number | null {
  const digits = text.replace(/so['ʻ’`]?m|sum|сум/gi, "").replace(/[\s.,_']/g, "");
  if (!/^\d{1,13}$/.test(digits)) return null;
  return Number(digits);
}
