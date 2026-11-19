// The Mini App API checks sign-in and permissions on the server before any action runs.
// The database and the actions are replaced by fakes here, so no database is needed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, User } from "../src/repo";
import { signInitData } from "../src/webapp-auth";
import { allPass, checks } from "./helpers";

vi.mock("../src/repo", () => ({
  userByTelegram: vi.fn(),
  createUser: vi.fn(),
  getJob: vi.fn(),
  getChecks: vi.fn(),
  markRun: vi.fn(),
  listUsers: vi.fn(async () => []),
  activeUsers: vi.fn(async () => []),
  setUserLanguage: vi.fn(),
  openJobsWithChecks: vi.fn(async () => []),
  weekStats: vi.fn(async () => ({ done: 0, onTime: 0 })),
}));

vi.mock("../src/actions", () => {
  const ok = (extra: object = {}) => vi.fn(async () => ({ ok: true, changed: true, followUp: async () => {}, ...extra }));
  return {
    cleanName: (s: string) => s.replace(/\s+/g, " ").trim(),
    createJob: ok({ id: 99 }),
    setCheck: ok(),
    claimDelivered: ok(),
    closeJob: ok({ exception: false }),
    cancelJob: ok(),
    editJob: ok(),
    createInvite: ok({ code: "ABCDEFGH", name: "New" }),
    setUserRole: ok(),
    setUserActive: ok(),
    proposeDate: ok({ offerId: 5 }),
    decideDate: ok({ jobId: 10 }),
  };
});

vi.mock("../src/notify", () => ({ describe: (e: unknown) => String(e), getBotUsername: async () => "escardin_bot" }));

const repo = await import("../src/repo");
const act = await import("../src/actions");
const { handleApi } = await import("../src/api");

const TOKEN = "123456:TEST-token";
const NOW = new Date("2026-11-19T08:00:00Z");

const person = (id: number, role: User["role"], over: Partial<User> = {}): User => ({
  id,
  telegram_id: 5000 + id,
  name: `P${id}`,
  role,
  language: "uz",
  is_active: true,
  is_reachable: true,
  ...over,
});
const ADMIN = person(1, "admin");
const SELLER = person(2, "seller");
const OTHER_SELLER = person(3, "seller");
const TAILOR = person(4, "tailor");
const OTHER_TAILOR = person(5, "tailor");
const SMM = person(6, "smm");
const PEOPLE = [ADMIN, SELLER, OTHER_SELLER, TAILOR, OTHER_TAILOR, SMM];

const JOB: Job = {
  id: 10,
  name: "Job",
  install_date: "2026-11-25",
  price: 5_000_000,
  seller_id: SELLER.id,
  tailor_id: TAILOR.id,
  status: "open",
  created_at: NOW,
  closed_at: null,
  closed_by: null,
  closed_with_exception: false,
  exception_reason: null,
  group_message_id: null,
  seller_name: "P2",
  tailor_name: "P4",
  closed_by_name: null,
};

let initFor: (u: User | { telegram_id: number }) => string;

function call(as: User | { telegram_id: number } | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { "content-type": "application/json", ...headers };
  if (as) h["x-telegram-init-data"] = initFor(as);
  return handleApi(
    new Request(`https://x.test/api/app/${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }),
    { api: {} as any, botToken: TOKEN, now: NOW },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  initFor = (u) =>
    signInitData(
      { auth_date: String(Math.floor(NOW.getTime() / 1000) - 30), user: JSON.stringify({ id: u.telegram_id, first_name: "X" }) },
      TOKEN,
    );
  vi.mocked(repo.userByTelegram).mockImplementation(async (tg) => PEOPLE.find((p) => p.telegram_id === tg) ?? null);
  vi.mocked(repo.getJob).mockResolvedValue({ ...JOB });
  vi.mocked(repo.getChecks).mockResolvedValue(checks());
  vi.mocked(repo.markRun).mockResolvedValue(true);
});

describe("sign-in", () => {
  it("rejects a request without Telegram data", async () => {
    expect((await call(null, "GET", "me")).status).toBe(401);
  });
  it("rejects tampered data", async () => {
    const res = await call(null, "GET", "me", undefined, { "x-telegram-init-data": initFor(SELLER).replace("hash=", "hash=0") });
    expect(res.status).toBe(401);
  });
  it("unknown people get 'not registered', deactivated people get 'deactivated'", async () => {
    const unknown = await call({ telegram_id: 42 }, "GET", "me");
    expect(unknown.status).toBe(403);
    expect(await unknown.json()).toEqual({ error: "not_registered" });

    vi.mocked(repo.userByTelegram).mockResolvedValue(person(9, "seller", { is_active: false }));
    const off = await call(person(9, "seller"), "GET", "me");
    expect(await off.json()).toEqual({ error: "deactivated" });
  });
  it("a known person gets their profile", async () => {
    const res = await call(TAILOR, "GET", "me");
    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ id: TAILOR.id, role: "tailor" });
  });
});

describe("permissions per role", () => {
  const check = (as: User, key: string, value: string) => call(as, "POST", "jobs/10/check", { key, value });

  it("tailor: steps 1–2 on own jobs, suggests dates; cannot create, cancel, edit or manage", async () => {
    expect((await check(TAILOR, "ready", "ready")).status).toBe(200);
    expect((await check(TAILOR, "quality", "ok")).status).toBe(403);
    expect((await check(TAILOR, "payment", "paid")).status).toBe(403);
    expect((await check(TAILOR, "video", "taken")).status).toBe(403);
    expect((await call(TAILOR, "POST", "jobs/10/offer", { date: "2026-11-27", reason: "Mato kech keldi" })).status).toBe(200);
    expect((await call(OTHER_TAILOR, "POST", "jobs/10/offer", { date: "2026-11-27", reason: "x" })).status).toBe(403);
    expect((await call(TAILOR, "POST", "offers/5/decide", { approve: true })).status).toBe(403);
    expect((await check(OTHER_TAILOR, "ready", "ready")).status).toBe(403);
    expect((await call(TAILOR, "POST", "jobs", { name: "X", install_date: "2026-11-30", price: 1, tailor_id: 4 })).status).toBe(403);
    expect((await call(TAILOR, "POST", "jobs/10/cancel")).status).toBe(403);
    expect((await call(TAILOR, "POST", "jobs/10/edit", { field: "name", value: "Y" })).status).toBe(403);
    expect((await call(TAILOR, "POST", "jobs/10/delivered")).status).toBe(403);
    expect((await call(TAILOR, "POST", "jobs/10/close")).status).toBe(403);
    expect((await call(TAILOR, "GET", "users")).status).toBe(403);
    expect(act.setCheck).toHaveBeenCalledTimes(1);
  });

  it("seller: step 1 on own jobs, edit and close own job; nothing on others' jobs", async () => {
    expect((await check(SELLER, "materials", "all_received")).status).toBe(200);
    expect((await check(OTHER_SELLER, "materials", "all_received")).status).toBe(403);
    for (const [k, val] of [["ready", "ready"], ["video", "taken"], ["payment", "paid"]]) expect((await check(SELLER, k, val)).status).toBe(403);
    expect((await call(SELLER, "POST", "jobs/10/offer", { date: "2026-11-27", reason: "x" })).status).toBe(403);
    expect((await call(SELLER, "POST", "jobs/10/edit", { field: "name", value: "Y" })).status).toBe(200);
    expect((await call(OTHER_SELLER, "POST", "jobs/10/edit", { field: "name", value: "Y" })).status).toBe(403);
    expect((await call(SELLER, "POST", "jobs/10/delivered")).status).toBe(200);
    expect((await call(SELLER, "POST", "jobs/10/cancel")).status).toBe(403);
    expect((await call(OTHER_SELLER, "POST", "jobs/10/close")).status).toBe(403);
    expect((await call(SELLER, "POST", "jobs", { name: "X", install_date: "2026-11-30", price: 1, tailor_id: 4 })).status).toBe(200);
    for (const path of ["users", "report"]) expect((await call(SELLER, "GET", path)).status).toBe(403);
    expect((await call(SELLER, "POST", "invites", { role: "seller", name: "Z" })).status).toBe(403);
    expect((await call(SELLER, "POST", "backup")).status).toBe(403);
  });

  it("SMM: steps 3–5 on any job, nothing else", async () => {
    for (const [k, val] of [["quality", "ok"], ["label", "on"], ["video", "taken"]]) expect((await check(SMM, k, val)).status).toBe(200);
    vi.mocked(repo.getJob).mockResolvedValue({ ...JOB, seller_id: 77, tailor_id: 88 });
    expect((await check(SMM, "label", "on")).status).toBe(200);
    for (const [k, val] of [["materials", "all_received"], ["ready", "ready"], ["payment", "paid"]]) expect((await check(SMM, k, val)).status).toBe(403);
    expect((await call(SMM, "POST", "jobs", { name: "X", install_date: "2026-11-30", price: 1, tailor_id: 4 })).status).toBe(403);
    expect((await call(SMM, "POST", "jobs/10/close")).status).toBe(403);
    expect((await call(SMM, "GET", "users")).status).toBe(403);
  });

  it("seller can close own job at 6/6 (the action re-checks inside a transaction)", async () => {
    vi.mocked(repo.getChecks).mockResolvedValue(allPass());
    expect((await call(SELLER, "POST", "jobs/10/close")).status).toBe(200);
    expect(act.closeJob).toHaveBeenCalledWith(expect.anything(), SELLER, 10, null);
  });

  it("admin: any check (payment only by admins), decides dates, cancel, users, invites, report", async () => {
    expect((await call(ADMIN, "POST", "offers/5/decide", { approve: true })).status).toBe(200);
    expect(act.decideDate).toHaveBeenCalledWith(expect.anything(), ADMIN, 5, true);
    for (const [k, val] of [["materials", "all_received"], ["payment", "paid"]]) expect((await check(ADMIN, k, val)).status).toBe(200);
    expect((await call(ADMIN, "POST", "jobs/10/cancel")).status).toBe(200);
    expect((await call(ADMIN, "GET", "users")).status).toBe(200);
    expect((await call(ADMIN, "POST", "users/2/role", { role: "tailor" })).status).toBe(200);
    expect((await call(ADMIN, "GET", "report")).status).toBe(200);
    const inv = await call(ADMIN, "POST", "invites", { role: "tailor", name: "New" });
    expect(await inv.json()).toMatchObject({ link: "https://t.me/escardin_bot?start=inv_ABCDEFGH" });
  });

  it("nobody can change a closed job", async () => {
    vi.mocked(repo.getJob).mockResolvedValue({ ...JOB, status: "done" });
    expect((await check(ADMIN, "payment", "paid")).status).toBe(409);
    expect((await call(ADMIN, "POST", "jobs/10/cancel")).status).toBe(409);
  });

  it("an action error is passed on with its code", async () => {
    vi.mocked(act.setCheck).mockResolvedValueOnce({ ok: false, error: "note_required" });
    const res = await check(SMM, "quality", "problem");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "note_required" });
  });

  it("the same request sent twice (double tap) runs once", async () => {
    vi.mocked(repo.markRun).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const h = { "x-request-id": "req-12345678" };
    expect((await call(ADMIN, "POST", "jobs/10/check", { key: "payment", value: "paid" }, h)).status).toBe(200);
    expect((await call(ADMIN, "POST", "jobs/10/check", { key: "payment", value: "paid" }, h)).status).toBe(409);
    expect(act.setCheck).toHaveBeenCalledTimes(1);
  });
});
