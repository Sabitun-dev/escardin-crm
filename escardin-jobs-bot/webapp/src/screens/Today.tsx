// "Bugun": what do I need to do now? Big task cards, most urgent first.
import { useCallback } from "react";
import type { AppJob, Task, TaskKind, TodayResponse } from "../../../src/app-types";
import { useApp } from "../App";
import { useData } from "../data";
import { dateLong, money } from "../format";
import { type AppKey, t } from "../i18n";
import { canCreate } from "../steps";
import { Icon, type IconName } from "../ui/Icon";
import { useMainButton } from "../ui/host";
import { Empty, Ring, SkelList, usePullToRefresh } from "../ui/kit";
import { haptic } from "../tg";

export const TASK_ICON: Record<TaskKind, IconName> = {
  check_delivered: "box",
  fix_problem: "alert",
  check_materials: "fabric",
  make_ready: "needle",
  check_quality: "sparkle",
  attach_label: "tag",
  wait_materials: "clock",
  bring_materials: "box",
  get_payment: "coin",
  take_video: "video",
  close_job: "flag",
  decide_date: "calendar",
  overdue: "clock",
  problems: "alert",
  materials_issues: "fabric",
};

export const taskTitle = (x: Task) => t(`task_${x.kind}` as AppKey, { n: x.jobIds.length, sum: money(x.amount) });

function taskSub(x: Task, jobs: Map<number, AppJob>): string {
  if (x.kind === "wait_materials") return t("task_wait_sub");
  if (x.kind === "get_payment" && x.amount) return money(x.amount);
  if (x.urgent > 0 && x.jobIds.length > 1) return t("urgent_n", { n: x.urgent });
  const name = jobs.get(x.jobIds[0]!)?.name ?? "";
  return x.jobIds.length > 1 ? `${name} +${x.jobIds.length - 1}` : name;
}

export function Today() {
  const { me, go } = useApp();
  const { data, error, reload } = useData<TodayResponse>("today");
  const ptr = usePullToRefresh(useCallback(() => reload(), [reload]));
  const jobs = new Map((data?.jobs ?? []).map((j) => [j.id, j]));

  const open = (x: Task) => {
    if (x.jobIds.length === 1) go({ name: "job", id: x.jobIds[0]!, step: x.step });
    else go({ name: "task", kind: x.kind });
  };

  const first = data?.tasks.find((x) => x.kind !== "wait_materials");
  useMainButton(
    first
      ? { text: t("start"), onClick: () => open(first) }
      : data && canCreate(me)
        ? { text: t("tab_new"), onClick: () => go({ name: "tab", tab: "new" }) }
        : null,
  );

  const day = dateLong(data?.today ?? null, true);
  return (
    <div className="screen">
      {ptr}
      <header className="head">
        <h1 className="h1">{t("hello", { name: me.name.split(" ")[0]! })}</h1>
        <div className="muted">{day.charAt(0).toUpperCase() + day.slice(1)}</div>
      </header>

      {!data && !error && <SkelList n={3} h={78} />}
      {!data && error && (
        <Empty icon="refresh" tone="grey" title={t("error_title")} text={t("error_text")}>
          <button className="btn btn-soft" onClick={reload}>
            {t("retry")}
          </button>
        </Empty>
      )}

      {data && data.tasks.length === 0 && (
        <div className="card">
          <Empty icon="check" title={t("happy_title")} text={t("happy_text")} />
        </div>
      )}

      {data && data.tasks.length > 0 && (
        <div className="stagger">
          {/* The one thing to do first, big */}
          {(() => {
            const hero = first ?? data.tasks[0]!;
            return (
              <button className="card hero tap" style={{ "--tone": `var(--${hero.tone}-deco)` } as React.CSSProperties} onClick={() => (haptic.tap(), open(hero))}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className={`tile-icon bg-${hero.tone}`}>
                    <Icon name={TASK_ICON[hero.kind]} size={30} />
                  </span>
                  {hero.urgent > 0 ? <Urgent /> : <span className="label" style={{ margin: 0 }}>{t("first_label")}</span>}
                </div>
                <div className="hero-title">{taskTitle(hero)}</div>
                <div className="tile-sub">{taskSub(hero, jobs)}</div>
              </button>
            );
          })()}

          {/* Everything else, calm and compact */}
          {data.tasks.length > 1 && (
            <>
              <div className="label" style={{ margin: "24px 4px 8px" }}>
                {t("later_label")}
              </div>
              <div className="card flush">
                {data.tasks
                  .filter((x) => x !== (first ?? data.tasks[0]))
                  .map((x) => (
                    <button key={x.kind} className="task-row tap" onClick={() => (haptic.tap(), open(x))}>
                      <span className={`tile-icon bg-${x.tone}`}>
                        <Icon name={TASK_ICON[x.kind]} size={22} />
                      </span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="tile-title" style={{ display: "block" }}>
                          {taskTitle(x)}
                        </span>
                        <span className="tile-sub" style={{ display: "block" }}>
                          {x.urgent > 0 && x.tone !== "gold" && (
                            <span className="tone-red" style={{ fontWeight: 600 }}>
                              {t("urgent_badge")} ·{" "}
                            </span>
                          )}
                          {taskSub(x, jobs)}
                        </span>
                      </span>
                      <Icon name="chevron" size={20} className="chev" />
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {data && (
        <div style={{ marginTop: 24 }}>
          <WeekCard week={data.week} />
        </div>
      )}
    </div>
  );
}

const Urgent = () => (
  <span className="badge bg-red pulse" style={{ flex: "none" }}>
    {t("urgent_badge")}
  </span>
);

/** "Mening haftam": personal only, never compared with others. */
export function WeekCard({ week }: { week: { done: number; onTime: number } }) {
  const pct = week.done ? Math.round((week.onTime / week.done) * 100) : 0;
  return (
    <section className="card" aria-label={t("week_title")}>
      <div className="row" style={{ marginBottom: 12, justifyContent: "space-between" }}>
        <span className="label" style={{ margin: 0 }}>
          {t("week_title")}
        </span>
        <span className="muted small row" style={{ gap: 4 }}>
          <Icon name="lock" size={14} /> {t("week_hint")}
        </span>
      </div>
      <div className="week">
        <Ring value={week.done ? pct : 0} max={100} size={72} stroke={8} label={week.done ? `${pct}%` : "—"} />
        <div className="grow">
          <div className="h2">{week.done ? t("week_done", { n: week.done }) : t("week_none")}</div>
          {week.done > 0 && (
            <div className="muted small">
              {pct}% {t("week_on_time")} · {pct >= 80 ? t("week_great") : t("week_good")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
