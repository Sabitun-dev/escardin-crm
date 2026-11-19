// First launch: 3 swipeable screens about the 6 steps and who does what. Skippable.
import { useRef, useState } from "react";
import type { AppJob } from "../../../src/app-types";
import type { Role } from "../../../src/rules/permissions";
import { type AppKey, t } from "../i18n";
import { CHECKS, CHECK_KEYS, STEP_ICON, checkName } from "../steps";
import { haptic } from "../tg";
import { Icon } from "../ui/Icon";
import { useBack, useMainButton } from "../ui/host";
import { StepPath, cx } from "../ui/kit";

const demo: AppJob = {
  id: 0,
  name: "",
  install_date: "2026-01-01",
  price: 0,
  status: "open",
  seller_id: 0,
  seller_name: "",
  tailor_id: 0,
  tailor_name: "",
  closed_at: null,
  closed_by_name: null,
  closed_with_exception: false,
  exception_reason: null,
  checks: CHECK_KEYS.map((key, i) => ({
    key,
    value: i < 3 ? CHECKS[key].pass : null,
    note: null,
    promised_date: null,
    delivered_claimed: false,
    amount: null,
    updated_by: null,
    updated_by_name: null,
    updated_at: null,
  })),
};

export function Intro({ role, onDone }: { role: Role; onDone: () => void }) {
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  useBack(onDone);

  const goTo = (n: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
    setI(n);
  };
  useMainButton({ text: i < 2 ? t("next") : t("intro_go"), onClick: () => (i < 2 ? goTo(i + 1) : (haptic.success(), onDone())) });

  const mine = CHECK_KEYS.filter((k) => role === "admin" || CHECKS[k].setBy === role || (role === "seller" && CHECKS[k].alsoSeller));

  return (
    <div className="intro" role="dialog" aria-label={t("intro1_title")}>
      <button className="btn btn-ghost sm intro-skip" onClick={onDone}>
        {t("skip")}
      </button>
      <div
        ref={track}
        className="intro-track"
        onScroll={(e) => {
          const el = e.currentTarget;
          const n = Math.round(el.scrollLeft / el.clientWidth);
          if (n !== i) {
            haptic.select();
            setI(n);
          }
        }}
      >
        <Slide title={t("intro1_title")} text={t("intro1_text")}>
          <div className="card" style={{ padding: "20px 12px" }}>
            <StepPath job={demo} next="label" />
          </div>
        </Slide>
        <Slide title={t(`intro2_${role}_title` as AppKey)} text={t(`intro2_${role}_text` as AppKey)}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {CHECK_KEYS.map((k, n) => {
              const on = mine.includes(k);
              return (
                <div key={k} className="card center" style={{ padding: "14px 6px", opacity: on ? 1 : 0.4 }}>
                  <span className={cx("tile-icon", on ? "bg-gold" : "bg-grey")} style={{ margin: "0 auto 8px" }}>
                    <Icon name={STEP_ICON[k]} size={24} />
                  </span>
                  <div className="small">
                    {n + 1}. {checkName(k)}
                  </div>
                </div>
              );
            })}
          </div>
        </Slide>
        <Slide title={t("intro3_title")} text={t("intro3_text")}>
          <div className="stack">
            <div className="card tile">
              <span className="tile-icon bg-amber">
                <Icon name={role === "tailor" ? "needle" : "coin"} size={26} />
              </span>
              <span className="tile-title grow">{t(role === "tailor" ? "task_make_ready" : "task_get_payment", { n: 3 })}</span>
              <Icon name="chevron" size={20} className="chev" />
            </div>
            <div className="card tile">
              <span className="tile-icon bg-green">
                <Icon name="check" size={26} />
              </span>
              <span className="tile-title grow">{t("happy_title")}</span>
            </div>
          </div>
        </Slide>
      </div>
      <div className="intro-dots" aria-hidden="true">
        {[0, 1, 2].map((n) => (
          <i key={n} className={cx(i === n && "on")} />
        ))}
      </div>
      <div style={{ height: "calc(var(--fake-main-h) + var(--safe-bottom) + 12px)" }} />
    </div>
  );
}

function Slide({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="intro-slide">
      {children}
      <div style={{ marginTop: 20 }}>
        <h2 className="h1" style={{ marginBottom: 10 }}>
          {title}
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 17 }}>
          {text}
        </p>
      </div>
    </section>
  );
}
