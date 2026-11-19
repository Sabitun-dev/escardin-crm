// Telegram Mini App features (https://core.telegram.org/bots/webapps), with safe fallbacks
// so the app also opens in a normal browser during local testing.

interface TgButton {
  setText(t: string): TgButton;
  setParams(p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): TgButton;
  show(): TgButton;
  hide(): TgButton;
  enable(): TgButton;
  disable(): TgButton;
  showProgress(leaveActive?: boolean): TgButton;
  hideProgress(): TgButton;
  onClick(cb: () => void): TgButton;
  offClick(cb: () => void): TgButton;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name?: string } };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  isVersionAtLeast(v: string): boolean;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  setBottomBarColor?(c: string): void;
  onEvent(e: string, cb: () => void): void;
  offEvent(e: string, cb: () => void): void;
  openTelegramLink(url: string): void;
  MainButton: TgButton;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: {
    impactOccurred(s: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(t: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  CloudStorage?: {
    setItem(k: string, v: string, cb?: (e: unknown, ok?: boolean) => void): void;
    getItem(k: string, cb: (e: unknown, v?: string) => void): void;
    removeItem(k: string, cb?: (e: unknown, ok?: boolean) => void): void;
  };
}

const w = window as unknown as { Telegram?: { WebApp?: TgWebApp } };
const raw = w.Telegram?.WebApp;

/** The Telegram WebApp object, only when really opened inside Telegram. */
export const tg: TgWebApp | null = raw && raw.initData ? raw : null;
const at = (v: string) => !!tg && tg.isVersionAtLeast(v);

export const hasNativeMainButton = at("6.1");
export const hasBackButton = at("6.1");
export const initData = () => tg?.initData ?? "";

export function startJobId(): number | null {
  const fromUrl = new URLSearchParams(location.search).get("job");
  const fromStart = tg?.initDataUnsafe.start_param?.replace(/^j/, "");
  const v = fromUrl ?? fromStart ?? "";
  return /^\d{1,9}$/.test(v) ? Number(v) : null;
}

export function scheme(): "light" | "dark" {
  if (tg) return tg.colorScheme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Call once at start: full height, colours, no accidental swipe-to-close. */
export function setupTelegram(onTheme: () => void) {
  if (!tg) return;
  tg.ready();
  tg.expand();
  if (at("7.7")) tg.disableVerticalSwipes?.();
  tg.onEvent("themeChanged", onTheme);
}

export function paintChrome(bg: string) {
  if (!tg || !at("6.1")) return;
  try {
    tg.setHeaderColor?.(bg);
    tg.setBackgroundColor?.(bg);
    if (at("7.10")) tg.setBottomBarColor?.(bg);
  } catch {}
}

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const reducedMotion = reduce;

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred("light"),
  select: () => tg?.HapticFeedback?.selectionChanged(),
  success: () => tg?.HapticFeedback?.notificationOccurred("success"),
  warn: () => tg?.HapticFeedback?.notificationOccurred("warning"),
  error: () => tg?.HapticFeedback?.notificationOccurred("error"),
};

export function openTelegramLink(url: string) {
  if (tg) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}

// ---- Back button ----
type Handler = () => void;
const backStack: Handler[] = [];
let backBound = false;
const onBack = () => backStack[backStack.length - 1]?.();

/** Registers a Back handler (the newest one wins). Returns a function to remove it. */
export function pushBack(h: Handler): () => void {
  backStack.push(h);
  if (tg && hasBackButton) {
    if (!backBound) {
      tg.BackButton.onClick(onBack);
      backBound = true;
    }
    tg.BackButton.show();
  }
  window.dispatchEvent(new Event("tg-back-change"));
  return () => {
    const i = backStack.lastIndexOf(h);
    if (i >= 0) backStack.splice(i, 1);
    if (tg && hasBackButton && !backStack.length) tg.BackButton.hide();
    window.dispatchEvent(new Event("tg-back-change"));
  };
}
export const backCount = () => backStack.length;
export const goBack = onBack;

// ---- Main button ----
export interface MainButtonState {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  progress?: boolean;
  tone?: "accent" | "green" | "red";
  /** Hides the button (used by sheets, so the screen button underneath is not tappable) */
  hidden?: boolean;
}
