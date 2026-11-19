import { createRoot } from "react-dom/client";
import { App } from "./App";
import { setLang } from "./i18n";
import "./styles.css";
import { paintChrome, scheme, setupTelegram, tg } from "./tg";
import { MainButtonHost, ToastHost } from "./ui/host";

function applyTheme() {
  document.documentElement.dataset.scheme = scheme();
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (/^#[0-9a-f]{6}$/i.test(bg)) paintChrome(bg);
}

// Until we know the person, speak the language of their Telegram (Uzbek by default)
const tgLang = (tg?.initDataUnsafe.user as { language_code?: string } | undefined)?.language_code;
setLang(tgLang === "en" ? "en" : "uz");

setupTelegram(applyTheme);
applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);

createRoot(document.getElementById("root")!).render(
  <ToastHost>
    <MainButtonHost>
      <App />
    </MainButtonHost>
  </ToastHost>,
);
