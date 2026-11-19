// "Ishlar": all jobs with search and filters; also the list behind a "Bugun" task.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppJob, JobFilter, JobsResponse, TaskKind, TodayResponse } from "../../../src/app-types";
import { errText, useApp } from "../App";
import { get } from "../api";
import { useData } from "../data";
import { dateLong, money, shortName } from "../format";
import { type AppKey, t } from "../i18n";
import { checkOf, isAdmin, valueName } from "../steps";
import { Icon } from "../ui/Icon";
import { useToast } from "../ui/host";
import { Badge, Chip, DueBadge, Empty, LoadMore, SegBar, SkelList, usePullToRefresh } from "../ui/kit";
import { taskTitle } from "./Today";

const FILTERS: JobFilter[] = ["m", "a", "t", "w", "o", "i", "u", "p"];

export function Jobs() {
  const { me } = useApp();
  const toast = useToast();
  const [filter, setFilter] = useState<JobFilter>(isAdmin(me) ? "a" : "m");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AppJob[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const seq = useRef(0);

  // Search waits until typing pauses
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  const path = (p: number) => `jobs?f=${filter}&page=${p}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  const loadFirst = useCallback(async () => {
    const n = ++seq.current;
    try {
      const r = await get<JobsResponse>(path(0));
      if (n !== seq.current) return;
      setItems(r.items);
      setTotal(r.total);
      setPage(0);
    } catch (e) {
      if (n === seq.current) {
        setItems((x) => x ?? []);
        toast(errText(e), "err");
      }
    }
  }, [filter, query]);

  useEffect(() => {
    setItems(null);
    loadFirst();
  }, [loadFirst]);

  const loadMore = async () => {
    if (more || !items || items.length >= total) return;
    setMore(true);
    const n = seq.current;
    try {
      const r = await get<JobsResponse>(path(page + 1));
      if (n !== seq.current) return;
      setItems((x) => [...(x ?? []), ...r.items.filter((j) => !x?.some((y) => y.id === j.id))]);
      setPage(page + 1);
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setMore(false);
    }
  };

  const ptr = usePullToRefresh(loadFirst);

  return (
    <div className="screen">
      {ptr}
      <header className="head row" style={{ justifyContent: "space-between" }}>
        <h1 className="h1">{t("jobs_title")}</h1>
        {items && <span className="muted">{t("n_jobs", { n: total })}</span>}
      </header>
      <div className="stack" style={{ gap: 12, marginBottom: 16 }}>
        <label className="search">
          <Icon name="search" size={22} />
          <input className="input" type="search" enterKeyHint="search" placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {!query && (
          <div className="chips" role="toolbar">
            {FILTERS.map((f) => (
              <Chip key={f} on={f === filter} onClick={() => setFilter(f)}>
                {t(`f_${f}` as AppKey)}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {!items && <SkelList n={4} h={150} />}
      {items && items.length === 0 && (
        <Empty icon={query ? "search" : "check"} tone={query ? "grey" : "green"} title={query ? t("list_empty_search", { q: query }) : t("list_empty")} />
      )}
      {items && items.length > 0 && (
        <div className="stack">
          {items.map((j) => (
            <JobItem key={j.id} job={j} />
          ))}
          {items.length < total && <LoadMore onVisible={loadMore} />}
          {more && <SkelList n={1} h={150} />}
        </div>
      )}
    </div>
  );
}

/** The jobs behind one "Bugun" task, each opening straight at the right step. */
export function TaskJobs({ kind }: { kind: TaskKind }) {
  const { data } = useData<TodayResponse>("today");
  const task = data?.tasks.find((x) => x.kind === kind);
  const jobs = new Map((data?.jobs ?? []).map((j) => [j.id, j]));
  return (
    <div className="screen sub">
      <header className="head">
        <h1 className="h1">{task ? taskTitle(task) : t("task_jobs_title")}</h1>
      </header>
      {!data && <SkelList n={3} h={150} />}
      {data && !task && <Empty icon="check" title={t("happy_title")} />}
      {task && (
        <div className="stack stagger">
          {task.jobIds.map((id) => {
            const j = jobs.get(id);
            return j ? <JobItem key={id} job={j} step={task.step} /> : null;
          })}
        </div>
      )}
    </div>
  );
}

export function JobItem({ job, step }: { job: AppJob; step?: AppJob["checks"][number]["key"] | null }) {
  const { go, today } = useApp();
  const m = checkOf(job, "materials");
  const pay = checkOf(job, "payment");
  const issue = m.value !== null && m.value !== "all_received";
  const rest = Math.max(0, job.price - (pay.amount ?? 0));
  const payTone = pay.value === "paid" ? "gold" : pay.value === "partly" ? "amber" : pay.value === "unpaid" ? "red" : "grey";

  return (
    <button className="card tap" style={{ textAlign: "left", width: "100%", display: "block" }} onClick={() => go({ name: "job", id: job.id, step })}>
      <div className="h2" style={{ fontSize: 18, overflowWrap: "anywhere" }}>
        {job.name}
      </div>
      <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
        <span className="row small" style={{ gap: 6 }}>
          <Icon name="calendar" size={18} /> {dateLong(job.install_date)}
        </span>
        {job.status === "open" ? (
          <DueBadge date={job.install_date} today={today} />
        ) : (
          <Badge tone={job.status === "done" ? "green" : "grey"} icon={job.status === "done" ? "check" : "ban"}>
            {t(job.status === "done" ? "status_done" : "status_cancelled")}
          </Badge>
        )}
      </div>
      <div className="row muted small" style={{ marginTop: 6, gap: 6 }}>
        <Icon name="needle" size={16} /> <span className="clip">{shortName(job.tailor_name)}</span>
        <span aria-hidden="true" style={{ margin: "0 2px" }}>·</span>
        <Icon name="user" size={16} /> <span className="clip">{shortName(job.seller_name)}</span>
      </div>
      <div style={{ margin: "14px 0 12px" }}>
        <SegBar job={job} />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Badge tone={payTone} icon={pay.value === "paid" ? "coin" : pay.value === "unpaid" ? "x" : pay.value === "partly" ? "alert" : "dot"}>
          {t("pay_badge", { v: valueName("payment", pay.value) })}
          {pay.value === "partly" ? ` · ${t("rest", { rest: money(rest) })}` : ""}
        </Badge>
      </div>
      {issue && (
        <div className="row small tone-amber" style={{ marginTop: 10, gap: 8, alignItems: "flex-start" }}>
          <Icon name="alert" size={18} />
          <span className="grow" style={{ overflowWrap: "anywhere" }}>
            <b style={{ fontWeight: 600 }}>{valueName("materials", m.value)}</b>
            {m.note ? `: ${m.note.length > 70 ? m.note.slice(0, 69) + "…" : m.note}` : ""}
          </span>
        </div>
      )}
    </button>
  );
}
