// The sheet for changing one of the six steps. Simple steps are one tap; problems are guided.
import { useEffect, useRef, useState } from "react";
import type { AppJob } from "../../../src/app-types";
import { needsAmount, validPartlyAmount } from "../../../src/rules/checks";
import { money } from "../format";
import { type AppKey, t } from "../i18n";
import { compressPhoto, MAX_ORIGINAL } from "../photo";
import { CHECKS, STATE_ICON, STEP_ICON, checkName, checkNum, checkOf, stepState, valueName, type CheckKey } from "../steps";
import { getJson, removeItem, setJson } from "../storage";
import { haptic } from "../tg";
import { DatePick } from "../ui/DatePick";
import { Icon } from "../ui/Icon";
import { HIDDEN, useMainButton, useToast } from "../ui/host";
import { Chip, MoneyInput, cx } from "../ui/kit";
import { Sheet } from "../ui/Sheet";

export interface StepExtra {
  note?: string | null;
  promised_date?: string | null;
  amount?: number | null;
  photo?: Blob | null;
}

const PROBLEM_CHIPS: AppKey[] = ["chip_uneven", "chip_torn", "chip_size", "chip_fabric_short", "chip_stain", "chip_thread"];
const MATERIAL_CHIPS: AppKey[] = ["chip_no_fabric", "chip_fabric_short", "chip_no_tape", "chip_no_accessory", "chip_wrong_color"];
const ISSUE_VALUES = CHECKS.materials.values.filter((v) => v !== "all_received");

interface Draft {
  issue: boolean;
  value: string;
  chips: string[];
  text: string;
  promised: string | null;
  amount: number | null;
  partly: boolean;
}

export function StepSheet(p: {
  job: AppJob;
  k: CheckKey;
  today: string;
  onClose: () => void;
  /** Resolves true when saved. */
  onSubmit: (value: string, extra: StepExtra) => Promise<boolean>;
}) {
  const { job, k, today } = p;
  const toast = useToast();
  const cur = checkOf(job, k);
  const draftKey = `draft_${job.id}_${k}`;
  const curIssue = (k === "materials" && cur.value !== null && cur.value !== "all_received") || (k === "quality" && cur.value === "problem");
  const [d, setD] = useState<Draft>({
    issue: false,
    value: k === "materials" ? (curIssue ? cur.value! : "incomplete") : k === "quality" ? "problem" : "",
    chips: [],
    text: curIssue ? (cur.note ?? "") : "",
    promised: cur.promised_date,
    amount: k === "payment" && cur.value === "partly" ? cur.amount : null,
    partly: false,
  });
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<AppKey | null>(null);
  const loaded = useRef(false);

  // Never lose what was typed: keep a draft until it is sent
  useEffect(() => {
    getJson<Draft>(draftKey).then((x) => {
      if (x && !loaded.current) setD((cur) => ({ ...cur, ...x }));
      loaded.current = true;
    });
  }, [draftKey]);
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(() => (d.issue || d.partly ? setJson(draftKey, d) : removeItem(draftKey)), 400);
    return () => clearTimeout(id);
  }, [d, draftKey]);
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  const set = (patch: Partial<Draft>) => {
    setErr(null);
    setD((x) => ({ ...x, ...patch }));
  };

  const note = [...d.chips.map((c) => t(c as AppKey)), d.text.trim()].filter(Boolean).join(", ").slice(0, 500);

  async function submit(value: string, extra: StepExtra = {}) {
    setBusy(true);
    const ok = await p.onSubmit(value, extra);
    setBusy(false);
    if (ok) removeItem(draftKey);
  }

  async function sendIssue() {
    if (note.length < 2) return warn("note_required");
    if (k === "quality") {
      if (!photo) return warn("photo_required");
      return submit("problem", { note, photo: photo.blob });
    }
    return submit(d.value, { note, promised_date: d.promised });
  }

  function sendAmount() {
    if (d.amount === null || !validPartlyAmount(d.amount, job.price)) return warn("amount_invalid");
    return submit("partly", { amount: d.amount });
  }

  function warn(key: AppKey) {
    haptic.warn();
    setErr(key);
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_ORIGINAL) return toast(t("photo_too_big"), "err");
    try {
      const blob = await compressPhoto(file);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      setErr(null);
      haptic.success();
    } catch {
      toast(t("photo_bad"), "err");
    }
  }

  const guided = d.issue && (k === "materials" || k === "quality");
  useMainButton(
    guided
      ? { text: t("send"), onClick: sendIssue, progress: busy }
      : d.partly
        ? { text: t("save"), onClick: sendAmount, progress: busy }
        : HIDDEN,
  );

  // Issues (they need a note / photo) go through the guided flow instead of a one-tap choice
  const choices = CHECKS[k].values.filter((v) => !((k === "materials" && v !== "all_received") || (k === "quality" && v === "problem")));

  return (
    <Sheet onClose={p.onClose} label={t("pick_title", { n: checkNum(k), check: checkName(k) })}>
      <div className="sheet-head">
        <span className={cx("tile-icon", `bg-${toneOf(stepState(cur))}`)}>
          <Icon name={STEP_ICON[k]} size={26} />
        </span>
        <div className="grow">
          <div className="h2">{t("pick_title", { n: checkNum(k), check: checkName(k) })}</div>
          <div className="muted small">{t(`ckq_${k}` as AppKey)}</div>
        </div>
      </div>

      {!guided && !d.partly && (
        <div className="stack">
          {choices.map((v) => {
            const s = stepState({ key: k, value: v });
            const tone = toneOf(s);
            return (
              <button
                key={v}
                className={cx("choice", `tone-${tone}`, cur.value === v && "on")}
                disabled={busy}
                onClick={() => {
                  haptic.tap();
                  if (needsAmount(k, v)) return set({ partly: true });
                  submit(v);
                }}
              >
                <span className={cx("tile-icon", `bg-${tone}`)}>
                  <Icon name={s === "notset" ? "dot" : s === "done" ? "check" : STATE_ICON[s]} size={24} stroke={2.4} />
                </span>
                <span className="grow" style={{ color: "var(--text)" }}>
                  {valueName(k, v)}
                </span>
                {cur.value === v && <Icon name="check" size={20} />}
              </button>
            );
          })}
          {(k === "materials" || k === "quality") && (
            <button className={cx("choice tone-amber", curIssue && "on")} onClick={() => set({ issue: true })}>
              <span className="tile-icon bg-amber">
                <Icon name="alert" size={24} stroke={2.2} />
              </span>
              <span className="grow" style={{ color: "var(--text)" }}>
                {k === "quality" ? valueName("quality", "problem") : t("something_wrong")}
              </span>
              <Icon name="chevron" size={20} />
            </button>
          )}
        </div>
      )}

      {/* Payment: partly, with the amount */}
      {d.partly && (
        <div>
          <div className="sheet-step">{t("amount_title")}</div>
          <MoneyInput label={t("amount_title")} value={d.amount} onChange={(n) => set({ amount: n })} autoFocus />
          <div className="row small" style={{ justifyContent: "space-between", margin: "10px 4px 0" }}>
            <span className="muted">{t("amount_hint", { price: money(job.price) })}</span>
            {d.amount !== null && d.amount < job.price && <span className="tone-gold" style={{ fontWeight: 600 }}>{t("amount_rest", { rest: money(job.price - d.amount) })}</span>}
          </div>
          {err && <p className="error-text">{t(err)}</p>}
        </div>
      )}

      {/* Materials issue: 1 what, 2 details, 3 when */}
      {guided && k === "materials" && (
        <div>
          <div className="sheet-step">{t("mat_step1")}</div>
          <div className="row-wrap">
            {ISSUE_VALUES.map((v) => (
              <Chip key={v} soft on={d.value === v} onClick={() => set({ value: v })}>
                {valueName("materials", v)}
              </Chip>
            ))}
          </div>
          <div className="sheet-step">{t("mat_step2")}</div>
          <NoteInput chips={MATERIAL_CHIPS} d={d} set={set} />
          <div className="sheet-step">{t("mat_step3")}</div>
          <DatePick
            value={d.promised}
            onChange={(x) => set({ promised: x })}
            today={today}
            quick={[
              [1, "promise_tomorrow"],
              [2, "promise_2"],
              [3, "promise_3"],
            ]}
            allowNone="promise_none"
          />
          {err && <p className="error-text">{t(err)}</p>}
        </div>
      )}

      {/* Quality problem: 1 what, 2 photo, 3 send */}
      {guided && k === "quality" && (
        <div>
          <div className="sheet-step">{t("problem_step1")}</div>
          <NoteInput chips={PROBLEM_CHIPS} d={d} set={set} />
          <div className="sheet-step">{t("problem_step2")}</div>
          <label className="photo-pick tap">
            {photo ? (
              <>
                <img src={photo.url} alt="" />
                <span className="retake">{t("retake_photo")}</span>
              </>
            ) : (
              <>
                <Icon name="camera" size={40} stroke={1.8} />
                <span>{t("take_photo")}</span>
              </>
            )}
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
          </label>
          <div className="sheet-step">{t("problem_step3")}</div>
          <p className="small muted row" style={{ margin: "0 4px", gap: 6 }}>
            <Icon name="chevron" size={16} className="chev-open" /> {t("problem_step3_hint")}
          </p>
          {err && <p className="error-text">{t(err)}</p>}
        </div>
      )}
    </Sheet>
  );
}

function NoteInput({ chips, d, set }: { chips: AppKey[]; d: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row-wrap">
        {chips.map((c) => (
          <Chip key={c} soft on={d.chips.includes(c)} onClick={() => set({ chips: d.chips.includes(c) ? d.chips.filter((x) => x !== c) : [...d.chips, c] })}>
            {t(c)}
          </Chip>
        ))}
      </div>
      <textarea className="input" maxLength={400} placeholder={t("note_placeholder")} aria-label={t("note_placeholder")} value={d.text} onChange={(e) => set({ text: e.target.value })} />
    </div>
  );
}

export const toneOf = (s: ReturnType<typeof stepState>) =>
  s === "done" ? "green" : s === "paid" ? "gold" : s === "attention" ? "amber" : s === "blocking" ? "red" : "grey";
