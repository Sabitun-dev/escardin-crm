# Escardin Jobs Bot

A Telegram bot that follows every curtain job from sale to installation and payment, so that no job
reaches installation with missing materials, a defect, no brand label, no SMM video, or an unpaid balance
without the right people knowing.

- Runs on **Netlify** (free plan is enough), with a free **Neon PostgreSQL** database.
- Speaks **Uzbek** (default) and **English**; each person picks their language under ❓ Help.
- Roles: **seller**, **tailor**, **admin**. Nobody can use the bot without an invite from an admin.
- Every job and every change is also posted to your **team Telegram group**, as a reply thread per job,
  so workers can discuss each job in one place.

## What the bot does

| Check | Set by | Passes when |
|---|---|---|
| 1. Materials from seller | Tailor | All received |
| 2. Curtain is ready | Tailor | Ready |
| 3. No problems (photo required for a problem) | Tailor | No problems |
| 4. Brand label attached | Tailor | Label on |
| 5. Video taken for SMM (approval only) | Seller | Video taken |
| 6. Client payment (with amounts in so'm) | Seller | Paid |

A seller closes their own job only at 6/6. An admin can close with an exception and a written reason.
Admins can set any check.

**Reminders** (every day at 09:00 Tashkent): promised materials not delivered, curtain not ready
0 to 2 days before install, and failing checks on install day or later.
**Weekly report** to admins every Sunday at 18:00, and any time from 📊 Reports.
**Backups** every day, kept for 14 days; admins get the latest with 💾 Backup or `/backup`.

## Setup, step by step

You need: a Telegram account, a GitHub account, a Netlify account, a Neon account (all free).

1. **Create the bot.** In Telegram open **@BotFather**, send `/newbot`, choose a name (for example
   *Escardin Ishlar*) and a username ending in `bot`. Copy the **token** it gives you. Keep it secret.
2. **Find your Telegram ID.** Open **@userinfobot**, press Start, copy the number after `Id:`.
   Do the same for the owner. These are your first admins.
3. **Create the database.** Go to <https://neon.tech>, sign up, create a project
   (region: *Europe (Frankfurt)* is closest). On the dashboard press **Connect**, turn on
   **Connection pooling**, and copy the connection string (it starts with `postgresql://`).
4. **Put the code on GitHub.** Create a new **private** repository and upload this folder
   (see [docs/DEPLOY_NETLIFY.md](docs/DEPLOY_NETLIFY.md), part B).
5. **Connect Netlify.** In Netlify: *Add new project → Import an existing project → GitHub* →
   pick the repository → *Deploy*. The settings are read from `netlify.toml`, so change nothing.
6. **Add the settings.** In Netlify: *Project configuration → Environment variables*, add:

   | Key | Value |
   |---|---|
   | `BOT_TOKEN` | token from step 1 (tick "Contains secret values") |
   | `WEBHOOK_SECRET` | any long random text, 30+ letters and digits, no spaces |
   | `ADMIN_TELEGRAM_IDS` | IDs from step 2, comma separated, e.g. `111111111,222222222` |
   | `DATABASE_URL` | connection string from step 3 |
   | `TIMEZONE` | `Asia/Tashkent` |
   | `DEFAULT_LANGUAGE` | `uz` |
   | `DAILY_CHECK_TIME` | `09:00` |
   | `WEEKLY_REPORT_DAY` | `sunday` |
   | `WEEKLY_REPORT_TIME` | `18:00` |

   Then *Deploys → Trigger deploy → Deploy project* so the new settings are used.
7. **Connect Telegram to the site.** In your browser open
   `https://YOUR-PROJECT.netlify.app/api/setup?key=YOUR_WEBHOOK_SECRET`.
   You should see `Database: OK`, `Webhook: OK` and `All done`.
8. **Start using it.** In Telegram open your bot and send `/start`. You are an admin.
9. **Invite people.** 👥 Users → ➕ Create invite → choose the role → type the name.
   Send the link to that person; they tap it and press Start. Any number of sellers and tailors is fine.
10. **Connect the team group.** Create a Telegram group, add the bot to it, and send
    `/groupid` in the group. Add the number it replies with (it starts with `-100`) as
    `GROUP_CHAT_ID` in Netlify, then redeploy (step 6, last line).

Test everything with the [two-phone checklist](docs/TEST_CHECKLIST.md).

## Everyday changes (Windsurf + Claude)

Edit in Windsurf, ask Claude to make the change, then ask it to commit and push. Netlify builds every
push and runs the type check and tests first. **If they fail, the old version stays live**, so a broken
edit never reaches your team. Details and troubleshooting: [docs/DEPLOY_NETLIFY.md](docs/DEPLOY_NETLIFY.md).

- All bot texts are in `src/locales/uz.ts` and `src/locales/en.ts`.
- Business rules (who may do what, the six checks, reminders) are in `src/rules/`.

## Project map

```
netlify/functions/telegram.mts   Telegram sends every message here (webhook)
netlify/functions/scheduler.mts  Runs every 15 min: reminders, weekly report, backups
netlify/functions/setup.mts      One-time setup page (/api/setup?key=...)
src/bot.ts                       Buttons, screens and flows
src/views.ts                     Message texts and keyboards
src/rules/                       Permissions, six checks, reminder selection (tested)
src/repo.ts                      Database reads and writes
src/db.ts                        Connection and database schema (migrations)
src/locales/                     Uzbek and English texts
src/scheduler.ts, backup.ts, notify.ts
scripts/                         Local testing, seed data, restore a backup
tests/                           Automated tests (npm test)
```

## Commands for your computer (optional)

Only needed to test locally or restore a backup. Install Node.js 22 LTS from <https://nodejs.org>, then in
this folder:

```bash
npm install
```

```bash
npm test
```

To run the bot on your computer, copy `.env.example` to `.env`, fill it in, then:

```bash
npm run dev:poll
```

This takes Telegram away from Netlify while it runs. When you stop it (Ctrl+C), open the
`/api/setup?key=...` link again so the live bot works.

`npm run seed` fills an **empty test database** with 5 fake users and 4 sample jobs. Never run it on the
real database.

## Ideas for later (not built)

- Customer phone numbers and addresses on the job.
- Several payments per job with dates (a payment history) instead of one "paid so far" amount.
- Forwarding SMM videos to a private channel.
- A web dashboard for the owner.
- Per-person reminder times, or a "snooze" button on reminders.
- Russian language.
