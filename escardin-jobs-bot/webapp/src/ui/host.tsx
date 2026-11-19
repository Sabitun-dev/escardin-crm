// App-wide helpers: toasts, the big bottom button (Telegram MainButton) and the Back button.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { hasNativeMainButton, haptic, type MainButtonState, pushBack, tg } from "../tg";
import { Icon } from "./Icon";

// ---------- Toasts ----------
type ToastKind = "ok" | "err" | "info";
interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const show = useCallback((text: string, kind: ToastKind = "ok") => {
    const id = Date.now() + Math.random();
    if (kind === "ok") haptic.success();
    else if (kind === "err") haptic.error();
    setItems([{ id, text, kind }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), kind === "err" ? 3200 : 2000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((x) => (
          <div key={x.id} className="toast">
            <span className={`ti ${x.kind}`}>
              <Icon name={x.kind === "ok" ? "check" : x.kind === "err" ? "x" : "alert"} size={16} stroke={3} />
            </span>
            <span>{x.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Main button ----------
// Screens and sheets register what the big bottom button should do; the newest registration wins.
type Reg = { id: number; state: MainButtonState };
const MainCtx = createContext<{ set: (id: number, s: MainButtonState | null) => void } | null>(null);
let nextId = 1;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function MainButtonHost({ children }: { children: ReactNode }) {
  const [regs, setRegs] = useState<Reg[]>([]);
  const set = useCallback((id: number, s: MainButtonState | null) => {
    // Ordered by when each one appeared (a sheet opened later stays on top of its screen)
    setRegs((l) => {
      const rest = l.filter((r) => r.id !== id);
      return s ? [...rest, { id, state: s }].sort((a, b) => a.id - b.id) : rest;
    });
  }, []);
  const last = regs[regs.length - 1]?.state ?? null;
  const top = last && !last.hidden ? last : null;

  // Native Telegram button
  const clickRef = useRef<() => void>(() => {});
  clickRef.current = () => top && !top.disabled && !top.progress && top.onClick();
  useEffect(() => {
    if (!tg || !hasNativeMainButton) return;
    const h = () => {
      haptic.tap();
      clickRef.current();
    };
    tg.MainButton.onClick(h);
    return () => {
      tg!.MainButton.offClick(h);
    };
  }, []);
  useEffect(() => {
    if (!tg || !hasNativeMainButton) return;
    const mb = tg.MainButton;
    if (!top) {
      mb.hideProgress();
      mb.hide();
      return;
    }
    const color = top.tone === "green" ? css("--green-deco") : top.tone === "red" ? css("--red-deco") : css("--accent");
    const textColor = top.tone === "green" || top.tone === "red" ? "#ffffff" : css("--on-accent");
    mb.setParams({ text: top.text, color, text_color: textColor, is_active: !top.disabled, is_visible: true });
    if (top.progress) mb.showProgress(false);
    else mb.hideProgress();
  }, [top]);

  // Fake button for a normal browser (local testing only)
  const fake = !hasNativeMainButton && top;
  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--fake-main-h", fake ? "72px" : "0px");
  }, [!!fake]);

  return (
    <MainCtx.Provider value={{ set }}>
      {children}
      {fake && (
        <div className="fake-main">
          <button
            className={`btn lg ${top.tone === "green" ? "btn-green" : top.tone === "red" ? "btn-danger" : "btn-primary"}`}
            disabled={top.disabled || top.progress}
            onClick={() => {
              haptic.tap();
              top.onClick();
            }}
          >
            {top.progress ? "…" : top.text}
          </button>
        </div>
      )}
    </MainCtx.Provider>
  );
}

/** Shows the big bottom button while this component is on screen. Pass null to hide it. */
export function useMainButton(state: MainButtonState | null) {
  const ctx = useContext(MainCtx)!;
  const idRef = useRef(0);
  if (!idRef.current) idRef.current = nextId++;
  const latest = useRef(state);
  latest.current = state;
  const key = state ? `${state.text}|${state.disabled}|${state.progress}|${state.tone}|${state.hidden}` : "";
  useEffect(() => {
    const s = latest.current;
    ctx.set(idRef.current, s ? { ...s, onClick: () => latest.current?.onClick() } : null);
  }, [key]);
  useEffect(() => () => ctx.set(idRef.current, null), []);
}

export const HIDDEN = { text: "", hidden: true, onClick: () => {} };

/** Telegram Back button: calls `onBack` while active. */
export function useBack(onBack: (() => void) | null) {
  const cb = useRef(onBack);
  cb.current = onBack;
  const active = !!onBack;
  useEffect(() => {
    if (!active) return;
    return pushBack(() => cb.current?.());
  }, [active]);
}
