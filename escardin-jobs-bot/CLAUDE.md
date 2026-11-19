# Notes for Claude (editing this project)

Escardin Jobs Bot: Telegram bot (grammY, TypeScript) on Netlify Functions with Neon PostgreSQL.
The owner is not a programmer: explain changes in plain words and keep them small.

## Rules
- Before every commit run `npm run typecheck`, `npm test` and `npm run build:app`; all must pass. Netlify runs the same
  checks and refuses to publish a failing build.
- Never commit `.env`, tokens, or connection strings. Settings live in Netlify environment variables.
- All user-facing text goes in `src/locales/uz.ts` AND `src/locales/en.ts` (same keys; Uzbek is default).
  Escape user-typed text with `esc()` before putting it into HTML messages.
  Mini App texts: `src/locales/app-uz.ts` AND `app-en.ts`. Never hard-code words in `webapp/`.
- Permissions are checked on the server in `src/rules/permissions.ts`; never rely on hiding a button.
- Database schema changes: append a new `{ version, sql }` to `MIGRATIONS` in `src/db.ts`; never edit
  an applied migration. Never delete jobs; they are cancelled.
- Button `callback_data` must stay under 64 bytes (use short ids).
- Times: store UTC, show Asia/Tashkent (`src/time.ts`).
- Write to the group with `postToGroup`, to people with `notifyMany`; a failed send must not stop others.
- Add or update tests in `tests/` when changing rules.

## Layout
- `netlify/functions/` webhook (`telegram.mts`), scheduler (every 15 min), setup page
- `src/actions.ts` every change (create, set check, close, edit, invites…) with its notifications and
  group posts; used by BOTH `src/bot.ts` (chat) and `src/api.ts` (Mini App). New business actions go here.
- `src/bot.ts` chat flows and buttons; `src/views.ts` texts/keyboards; `src/repo.ts` SQL
- `webapp/` Mini App (Vite + React), built into `public/app/` by `npm run build:app`; API shapes in
  `src/app-types.ts`. It reuses `src/rules/` to decide what to show; the server still checks every request.
- `src/rules/` pure business rules (tested); `src/scheduler.ts` reminders, report, backup
