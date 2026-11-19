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
- [ ] B opens the job: ✏️ buttons for checks 1–2 only, plus 📅 Yangi sana taklif qilish. There is no
      Yopish, Tahrirlash or Bekor qilish. (Checks 3–5 are tested with the SMM account in section 11;
      until then A, as admin, sets them.)
- [ ] B: ✏️ 1 → Miqdori yetarli emas → types a note → taps **Ertaga**. A gets "⚠️ Materiallar …" with the
      note and the promised date. The group gets a reply under the job's post.
- [ ] A: ✏️ 3 → Muammo bor → types a note → sends **text** → "Iltimos, rasm yuboring" → sends a **photo**.
      B (tailor) gets the photo with "❗️ Muammo". The card shows 🖼 Rasmlar (1), and tapping it shows the photo.
- [ ] B: ✏️ 2 → Tayyor. A: ✏️ 3 → Muammo yo'q; ✏️ 4 → Yorliq bor.

## 5. Materials flow
- [ ] A (the job's seller) sees 📦 Qolganini topshirdim on the card and taps it. B gets
      "📦 … topshirganini aytdi" with ✅ Hammasi olindi. Tapping 📦 again changes nothing.
- [ ] B taps ✅ Hammasi olindi → check 1 is ✅ and the 📦 line disappears.

## 6. Admin checks and closing (A)
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
- [ ] B opens any job of A → no ✏️ buttons for checks 2–6 (only 1 on own jobs) and no Tahrirlash.
- [ ] A: 👥 → B → 🚫 O'chirish → B writes to the bot → "Hisobingiz o'chirilgan". ♻️ Faollashtirish
      brings B back.

## 10. Reminders (next days)
- [ ] Leave an open job with a materials issue promised for today, and one installing tomorrow that is
      not Ready. After 09:00 Tashkent the seller and tailor get ⏰ reminders, once per day.
- [ ] A job past its install day with failing checks → admins get 🚨, once per day.
- [ ] On Sunday after 18:00 admins get the weekly report.

## 11. SMM role and new date (after the update with "SMM")
- [ ] A: 👥 → ➕ Create invite → **SMM xodimi** → a third account C joins as SMM.
- [ ] On any job: B (tailor) can set only 1 and 2; C (SMM) only 3, 4, 5 on every job; only A (admin) sets 6.
      The seller of a job can also set 1.
- [ ] C: 3. Sifat → Muammo bor (note + photo) → B (tailor), the seller and A get ❗️ with the photo.
- [ ] Make a job install tomorrow with 2. Tayyor not done. After 09:00 B gets ⏰ with
      **📅 Yangi sana taklif qilish**; the seller, C and A get ⚠️ "tikuvchi hali tikib bo'lmadi".
- [ ] B taps **📅 Yangi sana taklif qilish** → picks a date → writes "Mato kech keldi" → A gets 📅 with
      ✅ Tasdiqlash / ❌ Rad etish. The card shows "📅 Yangi sana taklifi …".
- [ ] A taps ✅ → the install date changes; B, the seller, C and the group are told. Tapping ✅ again →
      "Bu taklif allaqachon ko'rib chiqilgan". Repeat with ❌ → only B is told, the date stays.

## 12. Mini App ("Ochish")
Do this after the deploy shows **Published** and you opened the `/api/setup?key=...` link once more.
- [ ] Close and reopen the bot chat. Next to the message box there is an **Ochish** button. Tap it → the
      app opens on **Bugun** with a short 3-screen intro the first time (it can be skipped).
- [ ] Phone B (tailor) sees only tailor work on Bugun, for example "1 ta ishga yorliq taqing". Tapping a
      card opens the job with the right step already open.
- [ ] B taps a step they may not change (5. Video) → a small "Bu bosqichni sotuvchi belgilaydi" note,
      nothing changes. B taps 2. Tayyor → **Tayyor!** → the circle lights up green, a short "Saqlandi"
      appears, and the team group gets the same post as from the chat.
- [ ] B: 3. Sifat → **Muammo bor** → picks "Burma notekis" → takes a photo → **Yuborish**. A gets the
      ❗️ problem message with the photo and a **📱 Ochish** button that opens this job in the app.
      The job card shows the photo under **Rasmlar**.
- [ ] B: 1. Material → Muammo bor → "Lenta yo'q" → **Ertaga** → Yuborish. A (as seller) gets ⚠️. In the
      app A taps **Qolganini topshirdim** → B is told.
- [ ] C (SMM) opens the app: Bugun shows "yorliqni tekshiring" / "video kerak" tasks for any job.
- [ ] B (tailor) on a job not ready: **Yangi sana taklif qilish** → date chips → reason chip → Yuborish.
      A sees the request on the job card with Tasdiqlash / Rad etish, and on Bugun.
- [ ] A: 6. To'lov → **Qisman** → types 2500000 (the numeric keypad opens, it shows "2 500 000") → Saqlash.
- [ ] Make one job 6/6 → confetti and "Zo'r! Ish tayyor ✅" → **Yopish** closes it.
- [ ] A: **Yangi ish** → type half a name, close the app, open it again → the draft is still there.
      Finish it → the job opens; everyone gets 🆕 with **📱 Ochish**.
- [ ] A: **Boshqaruv** → Odamlar (change a role, turn someone off/on), Taklif yaratish (Share button),
      Hisobot, Zaxira nusxa (the file arrives in the bot chat).
- [ ] Profil → English → every screen is in English; switch back to O'zbekcha.
- [ ] Switch Telegram to dark mode (Settings → Appearance) → the app follows and stays readable.
- [ ] A Telegram account that was never invited opens the app (e.g. from a forwarded link) →
      "Administratordan taklif oling".
