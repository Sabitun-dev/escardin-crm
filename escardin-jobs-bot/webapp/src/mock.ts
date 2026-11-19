// LOCAL PREVIEW ONLY (npm run dev:app, then open /app/?mock&role=tailor). Never part of the real build:
// it is loaded only when import.meta.env.DEV is true. Uses the real rules from src/rules/.
import type { AppCheck, AppJob, AppUser } from "../../src/app-types";
import { CHECK_KEYS, type CheckKey, type CheckRow, passes } from "../../src/rules/checks";
import { canClose, planCheckSet, planClaimDelivered } from "../../src/rules/permissions";
import { buildReport } from "../../src/rules/reminders";
import { todayTasks } from "../../src/rules/today";
import { ApiError } from "./api";

const qs = new URLSearchParams(location.search);
const TODAY = qs.get("today") ?? "2026-11-19";
const add = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const users: AppUser[] = [
  { id: 1, name: "Dilshod Karimov", role: "admin", language: "uz", is_active: true, is_reachable: true },
  { id: 2, name: "Malika Yusupova", role: "seller", language: "uz", is_active: true, is_reachable: true },
  { id: 3, name: "Jasur Toshmatov", role: "seller", language: "uz", is_active: true, is_reachable: false },
  { id: 4, name: "Gulnora Rahimova", role: "tailor", language: "uz", is_active: true, is_reachable: true },
  { id: 5, name: "Nodira Saidova", role: "tailor", language: "uz", is_active: true, is_reachable: true },
  { id: 6, name: "Shahzoda Ergasheva", role: "tailor", language: "uz", is_active: false, is_reachable: true },
  { id: 7, name: "Sardor Aliyev", role: "smm", language: "uz", is_active: true, is_reachable: true },
];
const roleParam = qs.get("role");
const meId = roleParam === "tailor" ? 4 : roleParam === "seller" ? 2 : roleParam === "smm" ? 7 : 1;
if (qs.get("lang") === "en") users.find((u) => u.id === meId)!.language = "en";
const uname = (id: number) => users.find((u) => u.id === id)?.name ?? "";

type V = Partial<Record<CheckKey, [string, Partial<AppCheck>?]>>;
const who = (key: CheckKey, tailor: number) => (key === "materials" || key === "ready" ? tailor : key === "payment" ? 1 : 7);
// A waiting "new date" request from the tailor (job 6)
const offers: { id: number; job_id: number; old_date: string; new_date: string; reason: string; proposed_by_name: string; created_at: string }[] = [];
let nextJob = 1;
const jobs: AppJob[] = [];
function job(name: string, inDays: number, price: number, seller: number, tailor: number, v: V, status: AppJob["status"] = "open"): AppJob {
  const j: AppJob = {
    id: nextJob++,
    name,
    install_date: add(inDays),
    price,
    status,
    seller_id: seller,
    seller_name: uname(seller),
    tailor_id: tailor,
    tailor_name: uname(tailor),
    closed_at: status === "open" ? null : new Date().toISOString(),
    closed_by_name: status === "open" ? null : uname(seller),
    closed_with_exception: false,
    exception_reason: null,
    checks: CHECK_KEYS.map((key) => {
      const x = v[key];
      return {
        key,
        value: x?.[0] ?? null,
        note: null,
        promised_date: null,
        delivered_claimed: false,
        amount: x?.[0] === "paid" ? price : x?.[0] === "unpaid" ? 0 : null,
        updated_by: x ? who(key, tailor) : null,
        updated_by_name: x ? uname(who(key, tailor)) : null,
        updated_at: x ? new Date(Date.now() - 3600_000 * (3 + key.length)).toISOString() : null,
        ...x?.[1],
      };
    }),
  };
  jobs.push(j);
  return j;
}

const ok = ["all_received"] as [string];
job("Aliyevlar, Yunusobod — mehmonxona", 0, 4_500_000, 2, 4, { materials: ok, ready: ["ready"], quality: ["ok"], payment: ["partly", { amount: 2_500_000 }] });
job("Karimova N., Chilonzor — yotoqxona", 2, 3_200_000, 2, 4, {
  materials: ["incomplete", { note: "Lenta yo'q, mato 2 metr kam", promised_date: add(1), delivered_claimed: true }],
});
job("Do'stlik ko'chasi 12 — zal", -2, 7_800_000, 3, 4, { materials: ok, ready: ["ready"], quality: ["problem", { note: "Burma notekis, chap tomonda" }], label: ["on"] });
job("Rasulovlar oilasi — oshxona", 6, 2_150_000, 2, 5, { materials: ok, ready: ["ready"], quality: ["ok"], label: ["on"], payment: ["paid"] });
job("Uychi tumani hokimligi — ofis", 9, 12_400_000, 1, 5, {});
const late = job("Yusupov J., Davlatobod — bolalar xonasi", 1, 1_900_000, 2, 4, { materials: ok, ready: ["not_ready"] });
offers.push({ id: 1, job_id: late.id, old_date: late.install_date, new_date: add(4), reason: "Mato kech keldi", proposed_by_name: "Gulnora Rahimova", created_at: new Date().toISOString() });
job("Mirzayevlar, Chortoq — mehmonxona", 4, 5_600_000, 2, 4, { materials: ["not_enough", { note: "Tyul 3 metr yetmaydi" }] });
job("Sobirova D. — yotoqxona", -6, 3_000_000, 2, 5, { materials: ok, ready: ["ready"], quality: ["ok"], label: ["on"], video: ["taken"], payment: ["paid"] }, "done");

const history = (j: AppJob) => [
  { id: 1, type: "created", check_key: null, old_value: null, new_value: null, note: null, created_at: new Date(Date.now() - 86400_000 * 3).toISOString(), user_name: j.seller_name },
  ...j.checks
    .filter((c) => c.updated_at)
    .map((c, i) => ({ id: 10 + i, type: "check_set", check_key: c.key, old_value: null, new_value: c.value, note: c.note, created_at: c.updated_at!, user_name: c.updated_by_name })),
];

const me = () => users.find((u) => u.id === meId)!;
const rows = (j: AppJob) => j.checks as unknown as CheckRow[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};
const asOpen = (j: AppJob) => ({ ...j, checks: rows(j) });

export async function mockApi<T>(method: string, path: string, body: any, form?: FormData): Promise<T> {
  await sleep(qs.has("slow") ? 1500 : 220);
  const url = new URL(path, "http://x/");
  const [a, b, c] = url.pathname.split("/").filter(Boolean);
  const u = me();
  const find = (id: string | undefined) => jobs.find((j) => j.id === Number(id)) ?? fail(404, "not_found");
  const res = (x: unknown) => x as T;

  if (a === "me" && method === "GET") return res({ user: u, today: TODAY });
  if (a === "me" && b === "lang") return (u.language = body.lang), res({ ok: true });
  if (a === "today") {
    const open = jobs.filter((j) => j.status === "open").map(asOpen);
    const tasks = todayTasks(u, open.map((j) => ({ ...j, offer_pending: offers.some((o) => o.job_id === j.id) })), TODAY);
    const ids = new Set(tasks.flatMap((x) => x.jobIds));
    return res({ today: TODAY, tasks, jobs: jobs.filter((j) => ids.has(j.id)), week: u.role === "tailor" ? { done: 5, onTime: 4 } : { done: 3, onTime: 3 } });
  }
  if (a === "tailors") return res({ tailors: users.filter((x) => x.role === "tailor" && x.is_active).map((x) => ({ id: x.id, name: x.name })) });
  if (a === "users" && method === "GET") return res({ users });
  if (a === "users" && c === "role") return (users.find((x) => x.id === Number(b))!.role = body.role), res({ ok: true });
  if (a === "users" && c === "active") return (users.find((x) => x.id === Number(b))!.is_active = body.active), res({ ok: true });
  if (a === "invites") return res({ code: "K7M2Q9XA", name: body.name, role: body.role, link: "https://t.me/escardin_ishlar_bot?start=inv_K7M2Q9XA" });
  if (a === "backup") return res({ ok: true });
  if (a === "report") {
    const r = buildReport(jobs.filter((j) => j.status === "open").map(asOpen), TODAY);
    const items = (l: { id: number }[]) =>
      l.map((x) => {
        const j = find(String(x.id));
        return { id: j.id, name: j.name, install_date: j.install_date, progress: j.checks.filter((k) => passes(k)).length };
      });
    return res({
      today: TODAY,
      open: r.open.length,
      debt: r.debt,
      sections: {
        attention: items(r.attention),
        overdue: items(r.overdue),
        materials: items(r.materials),
        problems: items(r.problems),
        unpaid: items(r.unpaid),
        noVideo: items(r.noVideo),
        noLabel: items(r.noLabel),
      },
    });
  }
  if (a === "jobs" && !b && method === "GET") {
    const f = url.searchParams.get("f") ?? "a";
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    let list = q ? jobs.filter((j) => j.name.toLowerCase().includes(q)) : jobs.filter((j) => j.status === "open");
    if (!q) {
      const ch = (j: AppJob, k: CheckKey) => j.checks.find((x) => x.key === k)!.value;
      if (f === "m" && u.role === "smm") list = list.filter((j) => ["quality", "label", "video"].some((k) => !passes(j.checks.find((x) => x.key === k)!)));
      else if (f === "m") list = list.filter((j) => (u.role === "tailor" ? j.tailor_id : j.seller_id) === u.id);
      if (f === "t") list = list.filter((j) => j.install_date === TODAY);
      if (f === "w") list = list.filter((j) => j.install_date >= TODAY && j.install_date <= add(6));
      if (f === "o") list = list.filter((j) => j.install_date < TODAY);
      if (f === "i") list = list.filter((j) => ch(j, "materials") && ch(j, "materials") !== "all_received");
      if (f === "u") list = list.filter((j) => ch(j, "payment") !== "paid");
      if (f === "p") list = list.filter((j) => ch(j, "quality") === "problem");
    }
    list.sort((x, y) => x.install_date.localeCompare(y.install_date));
    return res({ items: list, total: list.length, page: 0, pageSize: 20 });
  }
  if (a === "jobs" && !b && method === "POST") {
    const j = job(body.name, 0, body.price, u.id, body.tailor_id, {});
    j.install_date = body.install_date;
    return res({ ok: true, id: j.id });
  }
  if (a === "jobs" && b && method === "GET") {
    const j = find(b);
    return res({ job: j, photos: j.checks.some((x) => x.value === "problem") ? [{ id: 1, caption: null, created_at: TODAY }] : [], history: history(j), offer: j.status === "open" ? (offers.find((o) => o.job_id === j.id) ?? null) : null });
  }
  if (a === "jobs" && c === "check") {
    const j = find(b);
    const fields = form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : "photo"])) : body;
    const key = fields.key as CheckKey;
    const prev = rows(j).find((x) => x.key === key)!;
    const plan = planCheckSet(u, j, prev, fields.value, {
      note: fields.note,
      promisedDate: fields.promised_date,
      amount: fields.amount === null || fields.amount === undefined ? null : Number(fields.amount),
      photoFileId: form?.get("photo") ? "x" : null,
    });
    if (!plan.ok) fail(plan.error === "forbidden" ? 403 : 400, plan.error);
    if (plan.ok) Object.assign(prev, plan.next, { updated_by: u.id, updated_by_name: u.name, updated_at: new Date().toISOString() });
    return res({ ok: true, changed: true });
  }
  if (a === "jobs" && c === "delivered") {
    const j = find(b);
    const m = rows(j)[0]!;
    const plan = planClaimDelivered(u, j, m);
    if (!plan.ok) fail(403, plan.error);
    m.delivered_claimed = true;
    return res({ ok: true, changed: true });
  }
  if (a === "jobs" && c === "close") {
    const j = find(b);
    const d = canClose(u, j, rows(j));
    if (!d.ok) fail(400, d.reason);
    if (d.ok && d.exception && !body.reason) fail(400, "reason_required");
    Object.assign(j, { status: "done", closed_at: new Date().toISOString(), closed_by_name: u.name, closed_with_exception: d.ok && d.exception, exception_reason: body.reason ?? null });
    return res({ ok: true });
  }
  if (a === "jobs" && c === "offer") {
    const j = find(b);
    if (u.role !== "tailor" || j.tailor_id !== u.id) fail(403, "forbidden");
    offers.splice(0, offers.length, ...offers.filter((o) => o.job_id !== j.id));
    offers.push({ id: Date.now(), job_id: j.id, old_date: j.install_date, new_date: body.date, reason: body.reason, proposed_by_name: u.name, created_at: new Date().toISOString() });
    return res({ ok: true });
  }
  if (a === "offers" && c === "decide") {
    if (u.role !== "admin") fail(403, "forbidden");
    const i = offers.findIndex((o) => o.id === Number(b));
    if (i < 0) fail(409, "already_decided");
    const o = offers.splice(i, 1)[0]!;
    if (body.approve) find(String(o.job_id)).install_date = o.new_date;
    return res({ ok: true });
  }
  if (a === "jobs" && c === "cancel") {
    Object.assign(find(b), { status: "cancelled", closed_at: new Date().toISOString(), closed_by_name: u.name });
    return res({ ok: true });
  }
  if (a === "jobs" && c === "edit") {
    const j = find(b);
    if (body.field === "tailor_id") Object.assign(j, { tailor_id: body.value, tailor_name: uname(body.value) });
    else (j as any)[body.field] = body.value;
    return res({ ok: true });
  }
  return fail(404, "not_found");
}

/** A soft placeholder "photo" (fabric with a fold) for the preview. */
export async function mockPhoto(_id: number): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#d9c7a6"/><stop offset=".5" stop-color="#efe3cc"/><stop offset="1" stop-color="#c9b28a"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/>${[30, 80, 130, 180, 230]
    .map((x) => `<path d="M${x} 0 C${x + 25} 100 ${x - 15} 200 ${x + 18} 300" stroke="#b39466" stroke-width="5" fill="none" opacity=".5"/>`)
    .join("")}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
