# Hand test checklist (two phones)

**Phone A** = you, the admin (your ID is in `ADMIN_TELEGRAM_IDS`). An admin can also act as a seller.
**Phone B** = a second Telegram account. It is the **tailor** for sections 1–8 and becomes a **seller**
in section 9.
Keep the team group open on one of the phones.

Tick each line. If something differs, write down the step and what you saw.

## 1. Registration and language
- [ ] B sends `/start` to the bot → "Siz hali ro'yxatdan o'tmagansiz…" (not registered).
- [ ] A sends `/start` → menu with ➕ Yangi ish, 📋 Ishlar, 👥 Foydalanuvchilar, 📊 Hisobot, ❓ Yordam.
- [ ] A: 👥 → ➕ Taklif yaratish → **Tikuvchi** → types "Test Tikuvchi" → gets a link.
- [ ] B opens the link and presses Start → "Xush kelibsiz, Test Tikuvchi! Rolingiz: Tikuvchi". The menu
      has only 📋 Ishlar and ❓ Yordam.
- [ ] B sends the same `/start CODE` again → "Siz allaqachon ro'yxatdan o'tgansiz". (A used code never registers anyone else.)
- [ ] A: ❓ Yordam → 🇬🇧 English → texts are English. Switch back to 🇺🇿 O'zbekcha.

## 2. Group
- [ ] The bot is in the group, `/groupid` in the group returns a number, and `GROUP_CHAT_ID` is set and redeployed.

## 3. New job (A as seller)
- [ ] A: ➕ Yangi ish → types a name containing `<` and `>` → date buttons appear.
- [ ] A types `31.02` → "Sanani tushunmadim". A types yesterday's date → asked to confirm → taps
      "Boshqa sana" → taps **Ertaga**.
- [ ] Tailor buttons show "Test Tikuvchi" → tap it.
- [ ] A types price `abc` → error. A types `4 500 000` → summary → ✅ Tasdiqlash.
- [ ] The card shows 0/6 and the name exactly as typed (the `<` `>` are visible, not swallowed).
- [ ] B gets "🆕 Yangi ish: …" with **Ochish**. The group gets a 🆕 post.
- [ ] Tapping ✅ Tasdiqlash twice quickly creates **one** job only.

## 4. Tailor checks (B)
- [ ] B opens the job: ✏️ buttons for checks 1–4 only. There is no Yopish, Tahrirlash or Bekor qilish.
- [ ] B: ✏️ 1 → Miqdori yetarli emas → types a note → taps **Ertaga**. A gets "⚠️ Materiallar …" with the
      note and the promised date. The group gets a reply under the job's post.
- [ ] B: ✏️ 3 → Muammo bor → types a note → sends **text** → "Iltimos, rasm yuboring" → sends a **photo**.
      A gets the photo with "❗️ Muammo". The card shows 🖼 Rasmlar (1), and tapping it shows the photo.
- [ ] B: ✏️ 3 → Muammo yo'q; ✏️ 2 → Tayyor; ✏️ 4 → Yorliq bor.

## 5. Materials flow
- [ ] A (the job's seller) sees 📦 Qolganini topshirdim on the card and taps it. B gets
      "📦 … topshirganini aytdi" with ✅ Hammasi olindi. Tapping 📦 again changes nothing.
- [ ] B taps ✅ Hammasi olindi → check 1 is ✅ and the 📦 line disappears.

## 6. Seller checks and closing (A)
- [ ] A: ✏️ 6 → Qisman to'langan → types `9000000` → error. Types `2000000` → 🟡 and
      "To'langan 2 000 000 / 4 500 000, qoldiq 2 500 000".
- [ ] A: ✏️ 5 → Video olindi.
- [ ] A: ✏️ 6 → To'langan → 6/6.
- [ ] A: ✅ Yopish → confirm → "✅ Yopilgan". B gets "✅ Ish yopildi". The group gets "✅ Yopildi".
- [ ] B taps an old check button on that job → "Bu ish yopilgan yoki bekor qilingan".

## 7. Edit, exception, cancel (A)
- [ ] A creates job 2 (tailor: Test Tikuvchi). ✏️ Tahrirlash → Sana → "Bir haftadan keyin" → B gets
      "📅 … sanasi … → …". Change Nomi and Narxi, and check that each change appears in the group.
- [ ] Job 2: ⚠️ Istisno bilan yopish → A types a reason → the card shows "Istisno bilan yopilgan" and the
      reason. The group shows it too.
- [ ] A creates job 3 → 🚫 Ishni bekor qilish → confirm → "Bekor qilingan". Job 3 is not in "Hammasi" any more.

## 8. Lists, history, admin tools
- [ ] 📋 Ishlar: try every filter (Meniki, Hammasi, Bugun, Hafta, Kechikkan, Material, To'lanmagan,
      Muammo). With more than 6 jobs, ◀️ ▶️ appear.
- [ ] 🔎 Qidirish → part of a name → finds open, closed and cancelled jobs.
- [ ] 🕓 Tarix shows who changed what and when. "Hammasini ko'rsatish" shows everything.
- [ ] 📊 Hisobot shows the report. 💾 Zaxira nusxa says "no backup yet" on day one, and sends a .json
      file from the next day on.
- [ ] B blocks the bot (bot chat → ⋮ → Block), then A creates a job with B as tailor. A gets **one**
      "… botni bloklagan" message. B unblocks and sends /start, and it works again.

## 9. Seller rules (B becomes a seller)
- [ ] A: 👥 → Test Tikuvchi → "→ Sotuvchi". B sends /menu and now sees ➕ Yangi ish.
- [ ] B: ➕ Yangi ish → at the tailor step "Faol tikuvchi yo'q" appears, because the only tailor is now
      a seller. (With a third phone as tailor, finish the job and check that B can close only at 6/6.)
- [ ] B opens job 1 (closed) or any job of A → no ✏️ buttons for checks 1–4 and no Tahrirlash.
- [ ] A: 👥 → B → 🚫 O'chirish → B writes to the bot → "Hisobingiz o'chirilgan". ♻️ Faollashtirish
      brings B back.

## 10. Reminders (next days)
- [ ] Leave an open job with a materials issue promised for today, and one installing tomorrow that is
      not Ready. After 09:00 Tashkent the seller and tailor get ⏰ reminders, once per day.
- [ ] A job past its install day with failing checks → admins get 🚨, once per day.
- [ ] On Sunday after 18:00 admins get the weekly report.
