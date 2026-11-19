// Run the bot on your own computer for testing:  npm run dev:poll
// It switches Telegram to "polling" mode. When you finish, open /api/setup on Netlify again
// so the live site receives messages.
import { getBot } from "../src/bot";
import { closeDb, ensureMigrated } from "../src/db";
import { runScheduled } from "../src/scheduler";

await ensureMigrated();
const bot = getBot();
await bot.api.deleteWebhook();
const timer = setInterval(() => runScheduled(bot.api).catch((e) => console.error(e)), 15 * 60 * 1000);
process.once("SIGINT", async () => {
  clearInterval(timer);
  await bot.stop();
  await closeDb();
  process.exit(0);
});
console.log("Bot is running locally. Press Ctrl+C to stop.");
await bot.start({ allowed_updates: ["message", "callback_query", "my_chat_member"] });
