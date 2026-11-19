// One-time setup: open https://YOUR-SITE.netlify.app/api/setup?key=YOUR_WEBHOOK_SECRET
// It creates the database tables and tells Telegram where to send messages.
// Safe to open again at any time (for example after changing the site address).
import type { Config } from "@netlify/functions";
import { Api } from "grammy";
import { cfg } from "../../src/config";
import { migrate } from "../../src/db";
import { describe } from "../../src/notify";
import uz from "../../src/locales/uz";
import en from "../../src/locales/en";

export default async (req: Request): Promise<Response> => {
  const secret = cfg.webhookSecret();
  const key = new URL(req.url).searchParams.get("key");
  if (!secret) return text("WEBHOOK_SECRET is not set in Netlify environment variables.", 500);
  if (key !== secret) return text("Wrong key.", 403);

  const lines: string[] = [];
  try {
    const applied = await migrate();
    lines.push(`Database: OK${applied.length ? ` (applied version ${applied.join(", ")})` : " (up to date)"}`);

    const api = new Api(cfg.botToken());
    const me = await api.getMe();
    const site = process.env.URL ?? new URL(req.url).origin;
    const url = `${site}/api/telegram`;
    await api.setWebhook(url, {
      secret_token: secret,
      allowed_updates: ["message", "callback_query", "my_chat_member"],
      drop_pending_updates: false,
    });
    lines.push(`Webhook: OK -> ${url}`);

    for (const [lang, L] of [["uz", uz], ["en", en]] as const) {
      await api.setMyCommands(
        [
          { command: "menu", description: L.cmd_menu },
          { command: "help", description: L.cmd_help },
          { command: "start", description: L.cmd_start },
        ],
        lang === cfg.defaultLang() ? {} : { language_code: lang },
      );
    }
    lines.push(`Commands: OK`);

    // The "Ochish" button next to the message box opens the Mini App
    const appUrl = `${(process.env.APP_URL || site).replace(/\/+$/, "")}/app/`;
    await api.setChatMenuButton({ menu_button: { type: "web_app", text: uz.btn_open, web_app: { url: appUrl } } });
    lines.push(`Menu button: OK -> ${appUrl}`);
    lines.push(`Bot: @${me.username}`);
    lines.push(`Admins from ADMIN_TELEGRAM_IDS: ${cfg.adminIds().length}`);
    lines.push(`Group: ${cfg.groupChatId() ? "set" : "not set (add the bot to the group and send /groupid there)"}`);
    lines.push("", "All done. Open the bot in Telegram and send /start.");
    return text(lines.join("\n"));
  } catch (e) {
    lines.push(`FAILED: ${describe(e)}`);
    return text(lines.join("\n"), 500);
  }
};

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export const config: Config = { path: "/api/setup" };
