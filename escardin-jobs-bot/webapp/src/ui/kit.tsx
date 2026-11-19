// UI kit: small building blocks every screen uses. Styles are in styles.css.
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AppJob, Tone } from "../../../src/app-types";
import { due, groupDigits, initials, readMoney } from "../format";
import { t } from "../i18n";
import { CHECK_KEYS, STATE_ICON, STEP_ICON, checkName, checkOf, progressOf, stepState, type CheckKey, type StepState } from "../steps";
import { haptic } from "../tg";
import { Icon, type IconName } from "./Icon";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- Button ----------
export function Button(p: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "soft" | "plain" | "ghost" | "danger" | "green";
  icon?: IconName;
  block?: boolean;
  size?: "sm" | "lg";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={p.type ?? "button"}
      className={cx("btn", `btn-${p.kind ?? "primary"}`, p.block && "block", p.size)}
      disabled={p.disabled}
      onClick={() => {
        haptic.tap();
        p.onClick?.();
      }}
    >
      {p.icon && <Icon name={p.icon} size={22} />}
      <span>{p.children}</span>
    </button>
  );
}

// ---------- Tile (a big tappable card) ----------
export function Tile(p: { icon: IconName; tone: Tone; title: ReactNode; sub?: ReactNode; onClick?: () => void; right?: ReactNode; pulse?: boolean }) {
  return (
    <button
      className="card tile tap"
      onClick={() => {
        haptic.tap();
        p.onClick?.();
      }}
    >
      <span className={cx("tile-icon", `bg-${p.tone}`)}>
        <Icon name={p.icon} size={26} />
      </span>
      <span className="grow">
        <span className="tile-title" style={{ display: "block" }}>
          {p.title}
        </span>
        {p.sub && <span className="tile-sub" style={{ display: "block" }}>{p.sub}</span>}
      </span>
      {p.right}
      {p.onClick && <Icon name="chevron" size={20} className="chev" />}
    </button>
  );
}

// ---------- Chip ----------
export function Chip(p: { children: ReactNode; on?: boolean; onClick: () => void; soft?: boolean; icon?: IconName }) {
  return (
    <button
      className={cx("chip", p.soft && "soft", p.on && "on")}
      aria-pressed={!!p.on}
      onClick={() => {
        haptic.select();
        p.onClick();
      }}
    >
      {p.icon && <Icon name={p.icon} size={18} />}
      {p.children}
    </button>
  );
}

// ---------- Badges ----------
export function Badge({ tone, children, icon, pulse }: { tone: Tone; children: ReactNode; icon?: IconName; pulse?: boolean }) {
  return (
    <span className={cx("badge", `bg-${tone}`, pulse && "pulse")}>
      {icon && !pulse && <Icon name={icon} size={16} stroke={2.4} />}
      {children}
    </span>
  );
}

export function DueBadge({ date, today }: { date: string; today: string }) {
  const d = due(date, today);
  const tone: Tone = d.kind === "overdue" ? "red" : d.kind === "today" || d.kind === "tomorrow" ? "amber" : "grey";
  return (
    <Badge tone={tone} icon="clock" pulse={d.kind === "overdue"}>
      {d.text}
    </Badge>
  );
}

// ---------- Avatar (initials, colour from the name) ----------
const AVATAR = ["#8f6424", "#2f7a6d", "#5b5fa8", "#a1506e", "#3d7ca8", "#7a6a2f", "#6b4f9a", "#2f7a46"];
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="avatar" style={{ width: size, height: size, background: AVATAR[h % AVATAR.length], fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

// ---------- Skeleton ----------
export const Skel = ({ h = 76, w = "100%", r }: { h?: number; w?: number | string; r?: number }) => (
  <div className="skel" style={{ height: h, width: w, borderRadius: r }} />
);
export const SkelList = ({ n = 4, h = 92 }: { n?: number; h?: number }) => (
  <div className="stack" aria-busy="true" aria-label={t("loading")}>
    {Array.from({ length: n }, (_, i) => (
      <Skel key={i} h={h} r={18} />
    ))}
  </div>
);

// ---------- Progress ring ----------
export function Ring({ value, max = 6, size = 64, stroke = 7, label }: { value: number; max?: number; size?: number; stroke?: number; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cx("ring", value >= max && "full")} style={{ width: size, height: size }} role="img" aria-label={`${value} / ${max}`}>
      <svg width={size} height={size}>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, value / max))}
        />
      </svg>
      <div className="ring-label" style={{ fontSize: size * 0.28 }}>
        {label ?? `${value}/${max}`}
      </div>
    </div>
  );
}

// ---------- 6-step path (like game levels) ----------
export function StepPath(p: { job: AppJob; next?: CheckKey | null; mine?: (k: CheckKey) => boolean; onTap?: (k: CheckKey) => void; popped?: CheckKey | null }) {
  return (
    <div className="path" role="list">
      {CHECK_KEYS.map((k) => {
        const c = checkOf(p.job, k);
        const s = stepState(c);
        const lit = s === "done" || s === "paid";
        return (
          <div key={k} role="listitem" className={cx("path-node", lit && "lit", p.mine?.(k) && "me")}>
            <button
              className={cx("path-dot", s, p.next === k && "next", p.popped === k && "pop")}
              onClick={() => p.onTap?.(k)}
              aria-label={`${CHECK_KEYS.indexOf(k) + 1}. ${checkName(k)}: ${t(stateWord[s])}`}
            >
              <Icon name={STEP_ICON[k]} size={22} />
              {(s === "attention" || s === "blocking") && (
                <span className="mini">
                  <Icon name={STATE_ICON[s]} size={13} stroke={2.6} />
                </span>
              )}
            </button>
            <span className="path-name">{checkName(k)}</span>
          </div>
        );
      })}
    </div>
  );
}

const stateWord: Record<StepState, "v_ready_ready" | "v_payment_paid" | "something_wrong" | "not_set"> = {
  done: "v_ready_ready",
  paid: "v_payment_paid",
  attention: "something_wrong",
  blocking: "something_wrong",
  notset: "not_set",
};

/** Compact 6-segment progress for list cards. */
export function SegBar({ job }: { job: AppJob }) {
  const n = progressOf(job);
  return (
    <div className="row" style={{ gap: 10 }} aria-label={t("steps_done", { n })}>
      <div className="segbar" aria-hidden="true">
        {job.checks.map((c) => (
          <i key={c.key} className={stepState(c)} />
        ))}
      </div>
      <span className="small num" style={{ fontWeight: 600 }}>
        {n}/6
      </span>
    </div>
  );
}

// ---------- Empty / happy state ----------
export function Empty({ icon, tone = "green", title, text, children }: { icon: IconName; tone?: Tone; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className={cx("art", `bg-${tone}`)}>
        <Icon name={icon} size={56} stroke={1.8} />
      </div>
      <div className="h2">{title}</div>
      {text && <p className="muted" style={{ margin: "0 auto 20px", maxWidth: 300 }}>{text}</p>}
      {children}
    </div>
  );
}

// ---------- Money input: numeric keypad, "4 500 000" while typing ----------
export function MoneyInput({ value, onChange, autoFocus, label }: { value: number | null; onChange: (n: number | null) => void; autoFocus?: boolean; label: string }) {
  return (
    <div className="money">
      <input
        className="input"
        inputMode="numeric"
        pattern="[0-9 ]*"
        autoComplete="off"
        aria-label={label}
        autoFocus={autoFocus}
        placeholder="0"
        value={value === null ? "" : groupDigits(value).replace(/ /g, " ")}
        onChange={(e) => onChange(readMoney(e.target.value))}
      />
      <span className="suffix">so'm</span>
    </div>
  );
}

// ---------- Infinite scroll trigger ----------
export function LoadMore({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && cb.current(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ height: 1 }} />;
}

// ---------- Pull to refresh ----------
export function usePullToRefresh(onRefresh: () => Promise<unknown>) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let startY = -1;
    let dist = 0;
    const down = (e: TouchEvent) => {
      startY = window.scrollY <= 0 && !document.querySelector(".sheet") ? e.touches[0]!.clientY : -1;
      dist = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY < 0) return;
      dist = Math.max(0, Math.min(110, (e.touches[0]!.clientY - startY) * 0.5));
      setPull(dist);
    };
    const up = async () => {
      if (startY < 0) return;
      startY = -1;
      if (dist >= 64) {
        haptic.tap();
        setBusy(true);
        setPull(56);
        await onRefresh().catch(() => {});
        setBusy(false);
      }
      setPull(0);
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [onRefresh]);
  const indicator = (
    <div className="ptr" style={{ height: pull }} aria-hidden={!busy}>
      <span className={cx("row", busy && "spin")} style={{ gap: 6, paddingBottom: 12 }}>
        <Icon name="refresh" size={20} />
      </span>
      {!busy && pull > 0 && <span style={{ paddingBottom: 14, marginLeft: 6 }}>{t(pull >= 64 ? "release_refresh" : "pull_refresh")}</span>}
    </div>
  );
  return indicator;
}

export { cx };
