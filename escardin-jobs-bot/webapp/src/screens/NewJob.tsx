// "Yangi ish": name, install date, tailor, price. The big bottom button creates it.
import { useEffect, useRef, useState } from "react";
import { errText, useApp } from "../App";
import { ApiError, post } from "../api";
import { invalidate, useData } from "../data";
import { dateLong, diffDays } from "../format";
import { type AppKey, t } from "../i18n";
import { getJson, removeItem, setJson } from "../storage";
import { haptic } from "../tg";
import { DatePick } from "../ui/DatePick";
import { Icon } from "../ui/Icon";
import { useMainButton, useToast } from "../ui/host";
import { Avatar, Button, Empty, MoneyInput, Skel, cx } from "../ui/kit";
import { Sheet } from "../ui/Sheet";

interface Draft {
  name: string;
  date: string | null;
  tailor: number | null;
  price: number | null;
}
const DRAFT = "draft_new_job";
const EMPTY: Draft = { name: "", date: null, tailor: null, price: null };

export function NewJob() {
  const { today, go } = useApp();
  const toast = useToast();
  const { data } = useData<{ tailors: { id: number; name: string }[] }>("tailors");
  const [d, setD] = useState<Draft>(EMPTY);
  const [missing, setMissing] = useState<(keyof Draft)[]>([]);
  const [pastAsk, setPastAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  // Never lose input: the form is kept as a draft until the job is created
  useEffect(() => {
    getJson<Draft>(DRAFT).then((x) => {
      if (x && !loaded.current && (x.name || x.price || x.tailor)) {
        setD({ ...EMPTY, ...x });
        toast(t("draft_restored"), "info");
      }
      loaded.current = true;
    });
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(() => setJson(DRAFT, d), 400);
    return () => clearTimeout(id);
  }, [d]);

  const set = (p: Partial<Draft>) => {
    setMissing((m) => m.filter((k) => !(k in p)));
    setD((x) => ({ ...x, ...p }));
  };

  async function create(confirmedPast = false) {
    const miss: (keyof Draft)[] = [];
    if (!d.name.trim()) miss.push("name");
    if (!d.date) miss.push("date");
    if (!d.tailor) miss.push("tailor");
    if (d.price === null) miss.push("price");
    if (miss.length) {
      haptic.warn();
      setMissing(miss);
      const names: Record<keyof Draft, AppKey> = { name: "f_name", date: "f_date", tailor: "f_tailor", price: "f_price" };
      return toast(t("fill_missing", { list: miss.map((k) => t(names[k])).join(", ") }), "info");
    }
    if (!confirmedPast && diffDays(today, d.date!) < 0) return setPastAsk(true);
    setPastAsk(false);
    setBusy(true);
    try {
      const r = await post<{ ok: true; id: number }>("jobs", { name: d.name.trim(), install_date: d.date, price: d.price, tailor_id: d.tailor });
      removeItem(DRAFT);
      invalidate("today");
      invalidate("jobs?");
      toast(t("created"));
      go({ name: "tab", tab: "today" });
      go({ name: "job", id: r.id });
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "duplicate")) toast(errText(e), "err");
    } finally {
      setBusy(false);
    }
  }

  const tailors = data?.tailors;
  useMainButton(tailors && tailors.length ? { text: t("create_job"), progress: busy, onClick: () => create() } : null);
  const bad = (k: keyof Draft) => missing.includes(k);

  return (
    <div className="screen">
      <header className="head">
        <h1 className="h1">{t("new_title")}</h1>
      </header>

      {tailors && tailors.length === 0 && <Empty icon="needle" tone="amber" title={t("no_tailors")} />}

      <div className="stack-lg">
        <section className="card">
          <label className="label" htmlFor="nj-name">
            {t("f_name")}
          </label>
          <input
            id="nj-name"
            className="input"
            maxLength={100}
            enterKeyHint="next"
            autoComplete="off"
            placeholder={t("f_name_ph")}
            value={d.name}
            onChange={(e) => set({ name: e.target.value })}
            style={bad("name") ? { borderColor: "var(--red)" } : undefined}
          />
        </section>

        <section className="card" style={bad("date") ? { borderColor: "var(--red)" } : undefined}>
          <div className="label">{t("f_date")}</div>
          {d.date && (
            <div className="row" style={{ margin: "0 4px 12px", gap: 8 }}>
              <Icon name="calendar" size={22} className="tone-gold" />
              <span className="h2">{dateLong(d.date, true)}</span>
            </div>
          )}
          <DatePick
            value={d.date}
            onChange={(x) => set({ date: x })}
            today={today}
            quick={[
              [0, "d_today"],
              [1, "d_tomorrow"],
              [3, "d_in3"],
              [7, "d_week"],
            ]}
          />
        </section>

        <section className="card" style={bad("tailor") ? { borderColor: "var(--red)" } : undefined}>
          <div className="label">{t("f_tailor")}</div>
          {!tailors && <Skel h={64} />}
          <div className="stack" style={{ gap: 8 }}>
            {tailors?.map((x) => (
              <button
                key={x.id}
                className={cx("choice", d.tailor === x.id && "on tone-gold")}
                style={{ minHeight: 64, padding: "10px 12px", gap: 10 }}
                aria-pressed={d.tailor === x.id}
                onClick={() => {
                  haptic.select();
                  set({ tailor: x.id });
                }}
              >
                <Avatar name={x.name} size={40} />
                <span className="clip grow" style={{ color: "var(--text)" }}>
                  {x.name}
                </span>
                {d.tailor === x.id && <Icon name="check" size={22} stroke={2.6} />}
              </button>
            ))}
          </div>
        </section>

        <section className="card" style={bad("price") ? { borderColor: "var(--red)" } : undefined}>
          <div className="label">{t("f_price")}</div>
          <MoneyInput label={t("f_price")} value={d.price} onChange={(n) => set({ price: n })} />
        </section>
      </div>

      {pastAsk && (
        <PastDateSheet
          date={d.date!}
          onYes={() => create(true)}
          onNo={() => {
            setPastAsk(false);
            set({ date: null });
          }}
        />
      )}
    </div>
  );
}

function PastDateSheet({ date, onYes, onNo }: { date: string; onYes: () => void; onNo: () => void }) {
  useMainButton({ text: t("past_yes"), onClick: onYes });
  return (
    <Sheet label={t("past_title")} onClose={onNo}>
      <div className="center">
        <div className="tile-icon bg-amber" style={{ margin: "0 auto 14px", width: 64, height: 64, borderRadius: 32 }}>
          <Icon name="calendar" size={30} />
        </div>
        <div className="h2" style={{ marginBottom: 8 }}>
          {t("past_title")}
        </div>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          {t("past_text", { date: dateLong(date, true) })}
        </p>
        <Button kind="ghost" onClick={onNo}>
          {t("past_no")}
        </Button>
      </div>
    </Sheet>
  );
}
