// Fills an EMPTY test database with fake users and four sample jobs:  npm run seed
// Do not run this on the real database. Fake users have made-up Telegram IDs and cannot receive messages.
import { closeDb, db, migrate } from "../src/db";
import { createJob, createUser, setCheck } from "../src/repo";
import { addDays, todayLocal } from "../src/time";

await migrate();
const [{ count }] = await db()<{ count: number }[]>`SELECT count(*) AS count FROM jobs`;
if (count > 0) {
  console.log("The database already has jobs. Seed is only for an empty test database. Nothing done.");
  await closeDb();
  process.exit(0);
}

const admin = await createUser(900000001, "Test Admin", "admin", "uz");
const s1 = await createUser(900000011, "Dilnoza (sotuvchi)", "seller", "uz");
const s2 = await createUser(900000012, "Jasur (sotuvchi)", "seller", "uz");
const t1 = await createUser(900000021, "Malika (tikuvchi)", "tailor", "uz");
const t2 = await createUser(900000022, "Rustam (tikuvchi)", "tailor", "en");

const today = todayLocal();
const j1 = await createJob({ name: "Aliyevlar — mehmonxona", install_date: addDays(today, 1), price: 6_500_000, seller_id: s1.id, tailor_id: t1.id });
const j2 = await createJob({ name: "Karimova — yotoqxona", install_date: addDays(today, 5), price: 3_200_000, seller_id: s1.id, tailor_id: t2.id });
const j3 = await createJob({ name: "Ofis, Navoiy ko'chasi", install_date: addDays(today, -2), price: 12_000_000, seller_id: s2.id, tailor_id: t1.id });
const j4 = await createJob({ name: "Toshpo'latov — oshxona", install_date: addDays(today, 10), price: 1_800_000, seller_id: s2.id, tailor_id: t2.id });

const T1 = { id: t1.id, role: "tailor" as const };
const T2 = { id: t2.id, role: "tailor" as const };
const S1 = { id: s1.id, role: "seller" as const };
const S2 = { id: s2.id, role: "seller" as const };

// Job 1: materials issue promised for today, otherwise in progress
await setCheck(T1, j1, "materials", "not_enough", { note: "Tyul 3 metr kam", promisedDate: today });
await setCheck(S1, j1, "payment", "partly", { amount: 3_000_000 });
// Job 2: everything passes (ready to close)
for (const [k, v] of [["materials", "all_received"], ["ready", "ready"], ["quality", "ok"], ["label", "on"]] as const) {
  await setCheck(T2, j2, k, v, {});
}
await setCheck(S1, j2, "video", "taken", {});
await setCheck(S1, j2, "payment", "paid", {});
// Job 3: overdue, not ready, no label (a real "Problem" needs a real photo, so test that by hand)
await setCheck(T1, j3, "materials", "all_received", {});
await setCheck(T1, j3, "ready", "not_ready", {});
await setCheck(T1, j3, "label", "off", {});
await setCheck(S2, j3, "payment", "unpaid", {});
// Job 4: nothing set yet
void j4;

console.log(`Seeded: 5 users (admin id ${admin.id}) and 4 jobs.`);
await closeDb();
