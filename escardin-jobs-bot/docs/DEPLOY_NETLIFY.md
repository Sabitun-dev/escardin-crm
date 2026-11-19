# Deployment guide: GitHub + Netlify + Neon

How the pieces fit:

```
Telegram  ──►  Netlify function /api/telegram  ──►  Neon PostgreSQL
                 ▲
GitHub repo ─────┘  (every push = new build; if tests fail, old version stays live)
Netlify scheduler (every 15 min) ──► reminders, weekly report, daily backup (Netlify Blobs)
```

Nothing runs on your computer. Telegram delivers messages to Netlify, which wakes the bot for a moment.

---

## A. Accounts you need (all free)

| Service | Used for | Free plan limits (enough for this bot) |
|---|---|---|
| GitHub | stores the code | private repositories |
| Netlify | runs the bot | 125k function calls per month; the bot uses roughly 3–10k |
| Neon | database | 0.5 GB storage, plenty for years of jobs |

## B. Put the code on GitHub

Easiest without commands:

1. On github.com press **New repository**, name it `escardin-jobs-bot`, choose **Private**, create it.
2. On the empty repository page click **uploading an existing file**.
3. Drag in everything in this folder **except** `node_modules` and `.env` (if you made one).
4. Press **Commit changes**.

With Windsurf: open this folder, open the Source Control panel, *Publish to GitHub* → private.
`.gitignore` already keeps `node_modules` and `.env` out.

## C. Create the Netlify project

1. app.netlify.com → **Add new project → Import an existing project → GitHub**.
2. Allow Netlify to see the repository, then pick `escardin-jobs-bot`.
3. Leave the build settings as Netlify shows them (they come from `netlify.toml`). Press **Deploy**.
4. The first deploy works even without settings. Note your address, e.g. `escardin-bot.netlify.app`.
   You can rename it under *Project configuration → Change project name*.

## D. Environment variables (where the bot token lives)

*Project configuration → Environment variables → Add a variable → Add a single variable.*
Add each key from the table in the README, step 6.

- For `BOT_TOKEN`, `WEBHOOK_SECRET` and `DATABASE_URL` tick **Contains secret values**.
- Leave scopes as **All scopes** and the value the same for all deploy contexts.
- Changing a variable does **not** change the running bot until you redeploy:
  *Deploys → Trigger deploy → Deploy project*.

The token is never in the code or on GitHub. If it ever leaks: @BotFather → `/revoke` → new token →
update `BOT_TOKEN` in Netlify → redeploy → open the setup link again.

## E. Connect Telegram (once)

Open in a browser:

```
https://YOUR-PROJECT.netlify.app/api/setup?key=YOUR_WEBHOOK_SECRET
```

You should see:

```
Database: OK (applied version 1)
Webhook: OK -> https://YOUR-PROJECT.netlify.app/api/telegram
Commands: OK
Bot: @YourBot
...
All done.
```

Open it again any time something looks disconnected; it is safe to repeat. You must repeat it if you
rename the Netlify project or after using `npm run dev:poll` on your computer.

## F. The team group

1. Create a Telegram group with your workers.
2. Add the bot to the group (group info → Add members → search the bot's username).
3. In the group send `/groupid`. The bot replies with a number like `-1002233445566`.
4. Add `GROUP_CHAT_ID` with that number in Netlify, then redeploy.

Every new job becomes a message in the group, and every change to that job is posted as a **reply** to it,
so each job has its own thread. The **Open** button opens the job in a private chat with the bot.

## G. Making changes with Windsurf and Claude

1. Open the project folder in Windsurf (it must be a clone of the GitHub repository).
2. Ask Claude for the change, for example: *"Change the Uzbek text of the weekly report title to …"*.
3. Ask Claude to run `npm run typecheck` and `npm test`, then to commit and push.
4. Netlify starts a build automatically (*Deploys* tab). In about a minute it is **Published**.
5. If the build **failed**, the bot keeps running the previous version. Open the failed deploy, copy the
   red error lines, and paste them to Claude to fix.

Tips:
- Texts: `src/locales/uz.ts` and `src/locales/en.ts` (keep the `{placeholders}` unchanged).
- Times: change `DAILY_CHECK_TIME`, `WEEKLY_REPORT_DAY`, `WEEKLY_REPORT_TIME` in Netlify, no code needed.
- Database changes: add a new entry at the end of `MIGRATIONS` in `src/db.ts`. Never edit an old one.
  It is applied automatically on the next message (or open the setup link).

## H. Logs and problems

- **Netlify → Logs → Functions → telegram / scheduler** shows errors.
- Admins also get a short Telegram message when something fails (at most once per 10 minutes).
- Bot does not answer at all → open the setup link; check `BOT_TOKEN` and `DATABASE_URL`; redeploy.
- "Wrong key" on the setup page → the `key=` part must equal `WEBHOOK_SECRET` exactly.
- Reminders not arriving → scheduled functions run only on the **published production** deploy; check
  *Logs → Functions → scheduler*. They start after `DAILY_CHECK_TIME` Tashkent time.
- Someone gets "not registered" → create a new invite for them; codes work once and last 7 days.

## I. Backups and restore

- Every day after `DAILY_CHECK_TIME` the bot saves a full copy of the database to **Netlify Blobs**
  (*Project → Blobs → backups*). The last 14 days are kept.
- Admins: 📊 Reports → 💾 Backup (or `/backup`) sends the newest file to you in Telegram. Save a copy
  somewhere safe from time to time.
- Neon also keeps its own short restore history (*Neon → Branches / Restore*), useful for "undo the last
  hour" accidents.

**Restore from a backup file** (replaces all current data):

1. Install Node.js 22 LTS on a computer and download the project from GitHub.
2. In the project folder create `.env` with one line: `DATABASE_URL=...` (the Neon string).
3. Run:

```bash
npm install
```

```bash
npm run restore -- C:\path\to\escardin-2026-11-19.json
```

4. Open the setup link again. The bot continues from the restored data.

## J. Moving the database later

Any PostgreSQL works. Create the new database, restore the latest backup into it (section I), change
`DATABASE_URL` in Netlify, redeploy.
