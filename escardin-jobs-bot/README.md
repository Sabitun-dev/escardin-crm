# Escardin Jobs Bot

A Telegram bot that follows every curtain job from sale to installation and payment, so that no job
reaches installation with missing materials, a defect, no brand label, no SMM video, or an unpaid balance
without the right people knowing.

- Runs on **Netlify** (free plan is enough), with a free **Neon PostgreSQL** database.
- Speaks **Uzbek** (default) and **English**; each person picks their language under ❓ Help.
- Roles: **seller**, **tailor**, **SMM** (also quality control), **admin**. Nobody can use the bot without an
  invite from an admin.
- Every job and every change is also posted to your **team Telegram group**, as a reply thread per job,
  so workers can discuss each job in one place.

## What the bot does

| Check | Set by | Passes when |
|---|---|---|
| 1. Materials from seller | The job's tailor or seller | All received |
| 2. Curtain is ready | The job's tailor | Ready |
| 3. No problems (photo required for a problem) | SMM (any SMM person) | No problems |
| 4. Brand label attached | SMM | Label on |
| 5. Video taken for SMM (approval only) | SMM | Video taken |
| 6. Client payment (with amounts in so'm) | Admin | Paid |

A seller closes their own job only at 6/6. An admin can close any job, below 6/6 with an exception and a
written reason. Admins can set any check. When SMM finds a problem, the tailor, the seller and the admins are told.

**New install date.** If the tailor will not finish in time, they tap **📅 Yangi sana taklif qilish**, pick a
date and write the reason. Admins get **✅ Tasdiqlash / ❌ Rad etish**. When approved, the date changes and the
tailor, seller, SMM and admins are told (and the team group). When rejected, the tailor is told.

**Reminders** (every day at 09:00 Tashkent): promised materials not delivered; curtain not ready 0 to 2 days
before install (the tailor, the seller, SMM people and admins are all warned, and the tailor's message has the
"suggest a new date" button); and failing checks on install day or later.
**Weekly report** to admins every Sunday at 18:00, and any time from 📊 Reports.
**Backups** every day, kept for 14 days; admins get the latest with 💾 Backup or `/backup`.

## The Mini App ("Ochish" button)

Next to the message box in the bot there is an **Ochish** button. It opens the Escardin app inside
Telegram: big, friendly screens for everyday work. Every notification also has a **📱 Ochish** button
that opens that job straight away (and **💬 Chatda** to see it in the chat as before).

- **Bugun**: what I need to do now, most urgent first. One big "do this first" card, then the rest.
- **Ishlar**: all jobs with search and filters (Meniki, Bugun, Kechikkan, Material, To'lanmagan…).
- **Job card**: the 6 steps as a path of icons; tap a step to set it. Problems are guided step by step
  (what happened → photo → send). At 6/6 there is a small celebration and a big **Yopish** button.
- **Yangi ish** (sellers, admins), **Profil** (language, "Mening haftam", help),
  **Boshqaruv** (admins: people, invites with a Share button, report, backup).

The chat bot keeps working as before: invites, reminders, the weekly report and group posts stay in chat.
The chat and the app use the same code for every change (`src/actions.ts`), so they never disagree.

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
   You should see `Database: OK`, `Webhook: OK`, `Menu button: OK` and `All done`.
   It is safe to open this link again at any time.
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

- All bot texts are in `src/locales/uz.ts` and `src/locales/en.ts`; Mini App texts are in
  `src/locales/app-uz.ts` and `src/locales/app-en.ts`.
- Business rules (who may do what, the six checks, reminders) are in `src/rules/`.

## Project map

```
netlify/functions/telegram.mts   Telegram sends every message here (webhook)
netlify/functions/scheduler.mts  Runs every 15 min: reminders, weekly report, backups
netlify/functions/setup.mts      One-time setup page (/api/setup?key=...), also sets the "Ochish" button
netlify/functions/api.mts        The Mini App talks to the server here (/api/app/...)
webapp/                          The Mini App screens (built into public/app/, served at /app/)
src/actions.ts                   Every change to a job or user (shared by the chat and the Mini App)
src/api.ts                       Mini App API: checks the Telegram sign-in and permissions
src/webapp-auth.ts               Checks the Telegram signature of Mini App requests
src/bot.ts                       Chat buttons, screens and flows
src/views.ts                     Message texts and keyboards
src/rules/                       Permissions, six checks, reminder selection (tested)
src/repo.ts                      Database reads and writes
src/db.ts                        Connection and database schema (migrations)
src/locales/                     Uzbek and English texts (app-uz.ts / app-en.ts: the Mini App)
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

This takes Telegram away from Netlify while it runs.

To look at the Mini App on your computer with sample data (no Telegram, no database needed):

```bash
npm run dev:app
```

then open <http://localhost:5173/app/?mock&role=tailor> (or `role=seller`, `role=admin`). When you stop it (Ctrl+C), open the
`/api/setup?key=...` link again so the live bot works.

`npm run seed` fills an **empty test database** with 5 fake users and 4 sample jobs. Never run it on the
real database.

## Ideas for later (not built)

- Customer phone numbers and addresses on the job.
- Several payments per job with dates (a payment history) instead of one "paid so far" amount.
- Forwarding SMM videos to a private channel.
- Per-person reminder times, or a "snooze" button on reminders.
- Russian language.
