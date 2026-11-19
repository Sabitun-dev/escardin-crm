// Telegram sends every message and button tap here (webhook).
import type { Config } from "@netlify/functions";
import { webhookCallback } from "grammy";
import { getBot } from "../../src/bot";
import { cfg } from "../../src/config";
import { ensureMigrated } from "../../src/db";
import { describe } from "../../src/notify";

let handler: ((req: Request) => Promise<Response>) | null = null;

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("Escardin bot webhook", { status: 200 });
  try {
    await ensureMigrated();
    handler ??= webhookCallback(getBot(), "std/http", {
      secretToken: cfg.webhookSecret() || undefined,
      onTimeout: "return",
      timeoutMilliseconds: 9000,
    });
    return await handler(req);
  } catch (e) {
    console.error("webhook failed:", describe(e));
    // 200 so Telegram does not keep resending the same update
    return new Response("error", { status: 200 });
  }
};

export const config: Config = { path: "/api/telegram" };
