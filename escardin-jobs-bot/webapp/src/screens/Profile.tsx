// "Profil": me, language, my week, short help.
import type { AppLang, TodayResponse } from "../../../src/app-types";
import { errText, useApp } from "../App";
import { post } from "../api";
import { invalidate, useData } from "../data";
import { type AppKey, t } from "../i18n";
import { CHECKS, CHECK_KEYS, STEP_ICON, checkName } from "../steps";
import { haptic } from "../tg";
import { Icon } from "../ui/Icon";
import { useToast } from "../ui/host";
import { Avatar, Badge, Button, cx } from "../ui/kit";
import { WeekCard } from "./Today";

export function Profile() {
  const { me, setMe, showIntro } = useApp();
  const toast = useToast();
  const { data } = useData<TodayResponse>("today");

  async function setLanguage(l: AppLang) {
    if (l === me.language) return;
    haptic.select();
    const prev = me;
    setMe({ ...me, language: l });
    try {
      await post("me/lang", { lang: l });
      invalidate();
    } catch (e) {
      setMe(prev);
      toast(errText(e), "err");
    }
  }

  return (
    <div className="screen">
      <header className="head">
        <h1 className="h1">{t("profile_title")}</h1>
      </header>
      <div className="stack-lg">
        <section className="card row" style={{ gap: 16 }}>
          <Avatar name={me.name} size={64} />
          <div className="grow">
            <div className="h2" style={{ overflowWrap: "anywhere" }}>
              {me.name}
            </div>
            <div style={{ marginTop: 6 }}>
              <Badge tone="gold" icon={me.role === "tailor" ? "needle" : me.role === "admin" ? "shield" : me.role === "smm" ? "video" : "user"}>
                {t(`role_${me.role}` as AppKey)}
              </Badge>
            </div>
          </div>
        </section>

        {data && <WeekCard week={data.week} />}

        <section className="card">
          <div className="label row" style={{ gap: 6 }}>
            <Icon name="globe" size={18} /> {t("language")}
          </div>
          <div className="seg" role="radiogroup" aria-label={t("language")}>
            {(["uz", "en"] as const).map((l) => (
              <button key={l} role="radio" aria-checked={me.language === l} className={cx(me.language === l && "on")} onClick={() => setLanguage(l)}>
                {l === "uz" ? "O'zbekcha" : "English"}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="label row" style={{ gap: 6 }}>
            <Icon name="help" size={18} /> {t("help_title")}
          </div>
          <p style={{ margin: "0 4px 14px" }}>{t("help_steps")}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {CHECK_KEYS.map((k, i) => (
              <div key={k} className="row" style={{ gap: 10, padding: 8, borderRadius: 12, background: "var(--bg)" }}>
                <span className={cx("tile-icon", CHECKS[k].setBy === "tailor" ? "bg-grey" : CHECKS[k].setBy === "smm" ? "bg-green" : "bg-gold")} style={{ width: 36, height: 36, borderRadius: 10 }}>
                  <Icon name={STEP_ICON[k]} size={20} />
                </span>
                <span className="small clip">
                  {i + 1}. {checkName(k)}
                </span>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ margin: "14px 4px 4px" }}>
            {t("help_parts")}
            <br />
            {t("help_close")}
          </p>
          <Button kind="ghost" size="sm" onClick={showIntro}>
            {t("help_intro")}
          </Button>
        </section>
      </div>
    </div>
  );
}
