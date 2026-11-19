// Checks that a Mini App request really comes from Telegram (the "initData" signature).
// Telegram signs the data with a key made from our bot token, so nobody can fake another person.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_AGE_SECONDS = 24 * 60 * 60;

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export type InitDataResult =
  | { ok: true; user: TgUser; authDate: number; startParam: string | null }
  | { ok: false; reason: "missing" | "bad_hash" | "expired" | "no_user" };

export function validateInitData(
  initData: string | null | undefined,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAge = MAX_AGE_SECONDS,
): InitDataResult {
  if (!initData) return { ok: false, reason: "missing" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: "bad_hash" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_hash" };

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || nowSeconds - authDate > maxAge) return { ok: false, reason: "expired" };

  let user: TgUser | null = null;
  try {
    user = JSON.parse(params.get("user") ?? "null");
  } catch {}
  if (!user || typeof user.id !== "number") return { ok: false, reason: "no_user" };
  return { ok: true, user, authDate, startParam: params.get("start_param") };
}

/** Builds signed initData, used by the tests (works like Telegram does). */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
