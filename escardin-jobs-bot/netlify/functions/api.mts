// The Mini App talks to the server here (/api/app/...). See src/api.ts.
import type { Config, Context } from "@netlify/functions";
import { Api } from "grammy";
import { handleApi } from "../../src/api";
import { cfg } from "../../src/config";
import { ensureMigrated } from "../../src/db";
import { describe } from "../../src/notify";

let api: Api | null = null;

export default async (req: Request, context: Context): Promise<Response> => {
  try {
    await ensureMigrated();
    api ??= new Api(cfg.botToken());
    return await handleApi(req, {
      api,
      botToken: cfg.botToken(),
      waitUntil: typeof context?.waitUntil === "function" ? (p) => context.waitUntil(p) : undefined,
    });
  } catch (e) {
    console.error("api failed:", describe(e));
    return new Response(JSON.stringify({ error: "server" }), { status: 500, headers: { "content-type": "application/json" } });
  }
};

export const config: Config = { path: "/api/app/*" };
