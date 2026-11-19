// The app shell: who am I, which screen is open, the tab bar.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AppUser, MeResponse, TaskKind } from "../../src/app-types";
import { ApiError, get } from "./api";
import { getJson, setJson } from "./storage";
import { type AppKey, setLang, t } from "./i18n";
import { canCreate, canManage, type CheckKey } from "./steps";
import { initData, startJobId } from "./tg";
import { Icon, type IconName } from "./ui/Icon";
import { useBack } from "./ui/host";
import { Button, Empty, Skel, cx } from "./ui/kit";
import { Admin, Report, Users } from "./screens/Admin";
import { Intro } from "./screens/Intro";
import { JobCard } from "./screens/JobCard";
import { Jobs, TaskJobs } from "./screens/Jobs";
import { NewJob } from "./screens/NewJob";
import { Profile } from "./screens/Profile";
import { Today } from "./screens/Today";

export type Tab = "today" | "jobs" | "new" | "profile" | "admin";
export type Route =
  | { name: "tab"; tab: Tab }
  | { name: "job"; id: number; step?: CheckKey | null }
  | { name: "task"; kind: TaskKind }
  | { name: "users" }
  | { name: "report" };

interface AppState {
  me: AppUser;
  today: string;
  setMe: (u: AppUser) => void;
  go: (r: Route) => void;
  back: () => void;
  replace: (r: Route) => void;
  showIntro: () => void;
}
const Ctx = createContext<AppState | null>(null);
export const useApp = () => useContext(Ctx)!;

/** Turns an error from the server into short words for a toast. */
export function errText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : "network";
  const key = `e_${code}` as AppKey;
  return t(key) !== key ? t(key) : t("e_server");
}

const INTRO_KEY = "intro_v1";

export function App() {
  const [me, setMe] = useState<AppUser | null>(null);
  const [today, setToday] = useState("");
  const [fail, setFail] = useState<string | null>(null);
  const [stack, setStack] = useState<Route[]>([{ name: "tab", tab: "today" }]);
  const [intro, setIntro] = useState(false);

  const boot = useCallback(async () => {
    setFail(null);
    if (!initData() && !(import.meta.env.DEV && location.search.includes("mock"))) return setFail("outside");
    try {
      const r = await get<MeResponse>("me");
      setLang(r.user.language);
      setMe(r.user);
      setToday(r.today);
      const job = startJobId();
      if (job) setStack([{ name: "tab", tab: "today" }, { name: "job", id: job }]);
      const seen = await getJson<boolean>(INTRO_KEY);
      if (!seen && !job) setIntro(true);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "network";
      setFail(code === "not_registered" || code === "deactivated" || code === "auth" ? code : "network");
    }
  }, []);
  useEffect(() => {
    boot();
  }, [boot]);

  const route = stack[stack.length - 1]!;
  const go = useCallback((r: Route) => {
    if (r.name === "tab") setStack([r]);
    else setStack((s) => [...s, r]);
    window.scrollTo(0, 0);
  }, []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const replace = useCallback((r: Route) => setStack((s) => [...s.slice(0, -1), r]), []);
  useBack(stack.length > 1 ? back : null);

  const state = useMemo<AppState | null>(
    () =>
      me
        ? {
            me,
            today,
            setMe: (u) => {
              setLang(u.language);
              setMe(u);
            },
            go,
            back,
            replace,
            showIntro: () => setIntro(true),
          }
        : null,
    [me, today, go, back, replace],
  );

  if (fail) return <NoAccess reason={fail} retry={boot} />;
  if (!state) return <Loading />;

  const tab = stack[0]!.name === "tab" ? (stack[0] as { tab: Tab }).tab : "today";
  const isRoot = stack.length === 1;
  return (
    <Ctx.Provider value={state}>
      <Screen key={stack.length + ":" + JSON.stringify(route)} route={route} />
      {isRoot && <TabBar tab={tab} />}
      {intro && (
        <Intro
          role={state.me.role}
          onDone={() => {
            setJson(INTRO_KEY, true);
            setIntro(false);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "tab":
      if (route.tab === "today") return <Today />;
      if (route.tab === "jobs") return <Jobs />;
      if (route.tab === "new") return <NewJob />;
      if (route.tab === "profile") return <Profile />;
      return <Admin />;
    case "job":
      return <JobCard id={route.id} step={route.step ?? null} />;
    case "task":
      return <TaskJobs kind={route.kind} />;
    case "users":
      return <Users />;
    case "report":
      return <Report />;
  }
}

function TabBar({ tab }: { tab: Tab }) {
  const { me, go } = useApp();
  const tabs: [Tab, IconName, AppKey][] = [
    ["today", "sun", "tab_today"],
    ["jobs", "list", "tab_jobs"],
  ];
  if (canCreate(me)) tabs.push(["new", "plus", "tab_new"]);
  tabs.push(["profile", "user", "tab_profile"]);
  if (canManage(me)) tabs.push(["admin", "shield", "tab_admin"]);
  return (
    <nav className="tabbar" aria-label="Menu">
      {tabs.map(([k, icon, label]) => (
        <button key={k} className={cx("tab", tab === k && "on")} aria-current={tab === k ? "page" : undefined} onClick={() => go({ name: "tab", tab: k })}>
          {k === "new" ? (
            <span className="plus">
              <Icon name="plus" size={22} stroke={2.4} />
            </span>
          ) : (
            <Icon name={icon} size={26} stroke={tab === k ? 2.2 : 1.8} />
          )}
          <span>{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}

function Loading() {
  return (
    <div className="screen" aria-busy="true">
      <div className="head stack">
        <Skel h={30} w="60%" r={10} />
        <Skel h={20} w="40%" r={8} />
      </div>
      <div className="stack">
        <Skel h={84} r={18} />
        <Skel h={84} r={18} />
        <Skel h={84} r={18} />
      </div>
    </div>
  );
}

function NoAccess({ reason, retry }: { reason: string; retry: () => void }) {
  const map: Record<string, [AppKey, AppKey, IconName]> = {
    not_registered: ["no_access_title", "no_access_text", "lock"],
    deactivated: ["deactivated_title", "deactivated_text", "ban"],
    outside: ["outside_title", "outside_text", "globe"],
    auth: ["auth_title", "auth_text", "refresh"],
    network: ["error_title", "error_text", "refresh"],
  };
  const [title, text, icon] = map[reason] ?? map.network!;
  return (
    <div className="screen sub" style={{ minHeight: "80vh", display: "grid", placeItems: "center" }}>
      <Empty icon={icon} tone={reason === "network" || reason === "auth" ? "grey" : "gold"} title={t(title)} text={t(text)}>
        {reason === "network" && (
          <Button kind="soft" icon="refresh" onClick={retry}>
            {t("retry")}
          </Button>
        )}
      </Empty>
    </div>
  );
}
