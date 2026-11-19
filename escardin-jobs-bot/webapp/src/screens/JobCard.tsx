// One job: header, the 6-step path, each step with who/when/note, actions, photos, history.
import { useEffect, useRef, useState } from "react";
import type { AppEvent, AppJob, AppUser, JobDetailResponse } from "../../../src/app-types";
import { needsNote, needsPromisedDate, paidAmount } from "../../../src/rules/checks";
import { errText, useApp } from "../App";
import { ApiError, photoUrl, post, request } from "../api";
import { invalidate, useData } from "../data";
import { dateLong, dateTime, diffDays, money, shortName } from "../format";
import { type AppKey, t } from "../i18n";
import {
  CHECK_KEYS,
  STEP_ICON,
  canCancel,
  canClaim,
  canEdit,
  canSet,
  checkName,
  checkNum,
  checkOf,
  closeDecision,
  isAdmin,
  missingOf,
  nextStepFor,
  progressOf,
  stepState,
  valueName,
  whoSets,
  type CheckKey,
} from "../steps";
import { haptic, reducedMotion } from "../tg";
import { DatePick } from "../ui/DatePick";
import { Icon } from "../ui/Icon";
import { HIDDEN, useBack, useMainButton, useToast } from "../ui/host";
import { Avatar, Badge, Button, DueBadge, Empty, MoneyInput, Ring, Skel, StepPath, cx } from "../ui/kit";
import { Sheet } from "../ui/Sheet";
import { type StepExtra, StepSheet, toneOf } from "./StepSheet";

type SheetState =
  | null
  | { type: "step"; key: CheckKey }
  | { type: "missing" }
  | { type: "exception" }
  | { type: "cancel" }
  | { type: "edit" }
  | { type: "history" };

/** What the job looks like right after a change, before the server answers. */
function applyLocal(job: AppJob, me: AppUser, key: CheckKey, value: string, x: StepExtra): AppJob {
  return {
    ...job,
    checks: job.checks.map((c) =>
      c.key !== key
        ? c
        : {
            ...c,
            value,
            note: needsNote(key, value) ? (x.note ?? null) : null,
            promised_date: needsPromisedDate(key, value) ? (x.promised_date ?? null) : null,
            delivered_claimed: false,
            amount: key === "payment" ? paidAmount(value, job.price, x.amount) : null,
            updated_by: me.id,
            updated_by_name: me.name,
            updated_at: new Date().toISOString(),
          },
    ),
  };
}

export function JobCard({ id, step }: { id: number; step: CheckKey | null }) {
  const { me, today } = useApp();
  const toast = useToast();
  const { data, error, reload, mutate } = useData<JobDetailResponse>(`jobs/${id}`);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [popped, setPopped] = useState<CheckKey | null>(null);
  const [party, setParty] = useState(false);
  const [busy, setBusy] = useState(false);
  const autoOpened = useRef(false);
  const job = data?.job;

  // Opened from a task or a notification: go straight to the step
  useEffect(() => {
    if (!job || autoOpened.current) return;
    autoOpened.current = true;
    if (step && canSet(me, job, step)) setSheet({ type: "step", key: step });
  }, [job, step, me]);

  const refreshAll = () => {
    invalidate("today");
    invalidate("jobs?");
    reload();
  };

  async function submitCheck(key: CheckKey, value: string, x: StepExtra): Promise<boolean> {
    if (!data) return false;
    const before = data;
    const wasDone = progressOf(before.job) === 6;
    const after = applyLocal(before.job, me, key, value, x);
    const nowDone = progressOf(after) === 6;
    const optimistic = !x.photo;
    if (optimistic) {
      mutate((d) => ({ ...d, job: after }));
      setSheet(null);
      setPopped(key);
    }
    try {
      const path = `jobs/${id}/check`;
      if (x.photo) {
        const form = new FormData();
        form.set("key", key);
        form.set("value", value);
        if (x.note) form.set("note", x.note);
        form.set("photo", x.photo, "photo.jpg");
        await request("POST", path, undefined, form);
        mutate((d) => ({ ...d, job: after }));
        setSheet(null);
        setPopped(key);
      } else {
        const r = await post<{ ok: true; changed: boolean }>(path, { key, value, note: x.note ?? null, promised_date: x.promised_date ?? null, amount: x.amount ?? null });
        if (!r.changed) {
          toast(t("no_change"), "info");
          return true;
        }
      }
      if (!wasDone && nowDone) {
        haptic.success();
        setParty(true);
      } else toast(t(x.photo || x.note ? "sent" : "saved"));
      refreshAll();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === "duplicate") return true;
      mutate(() => before); // roll back
      toast(errText(e), "err");
      reload();
      return false;
    }
  }

  async function act(path: string, body: unknown, okText: AppKey) {
    setBusy(true);
    try {
      await post(`jobs/${id}/${path}`, body);
      toast(t(okText));
      setSheet(null);
      setParty(false);
      refreshAll();
      return true;
    } catch (e) {
      toast(errText(e), "err");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const decision = job ? closeDecision(me, job) : null;
  const complete = job ? progressOf(job) === 6 : false;
  const canCloseNow = !!decision?.ok && !decision.exception;
  const next = job ? nextStepFor(me, job) : null;

  useMainButton(
    !job || job.status !== "open" || party
      ? null
      : canCloseNow
        ? { text: t("btn_close"), tone: "green", progress: busy, onClick: () => act("close", {}, "closed_ok") }
        : next
          ? { text: t("do_step", { step: `${checkNum(next)}. ${checkName(next)}` }), onClick: () => setSheet({ type: "step", key: next }) }
          : canClaim(me, job)
            ? { text: t("btn_delivered"), progress: busy, onClick: () => act("delivered", {}, "delivered_saved") }
            : null,
  );

  if (!data) {
    return (
      <div className="screen sub">
        {error ? (
          <Empty icon={error.code === "not_found" ? "search" : "refresh"} tone="grey" title={error.code === "not_found" ? t("e_not_found") : t("error_title")}>
            {error.code !== "not_found" && (
              <Button kind="soft" onClick={reload}>
                {t("retry")}
              </Button>
            )}
          </Empty>
        ) : (
          <div className="stack">
            <Skel h={150} r={18} />
            <Skel h={130} r={18} />
            <Skel h={380} r={18} />
          </div>
        )}
      </div>
    );
  }

  const j = data.job;
  const open = j.status === "open";
  const n = progressOf(j);
  const tapStep = (k: CheckKey) => {
    if (open && canSet(me, j, k)) {
      haptic.tap();
      setSheet({ type: "step", key: k });
    } else if (open) {
      haptic.warn();
      toast(t("locked_step", { who: whoSets(k) }), "info");
    }
  };

  return (
    <div className="screen sub">
      {/* Header */}
      <section className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
          <h1 className="h1" style={{ overflowWrap: "anywhere" }}>
            {j.name}
          </h1>
          {!open && (
            <Badge tone={j.status === "done" ? (j.closed_with_exception ? "amber" : "green") : "grey"} icon={j.status === "done" ? "check" : "ban"}>
              {t(j.status === "done" ? (j.closed_with_exception ? "status_done_exc" : "status_done") : "status_cancelled")}
            </Badge>
          )}
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
          <span className="row" style={{ gap: 6 }}>
            <Icon name="calendar" size={20} />
            <span style={{ fontWeight: 600 }}>{dateLong(j.install_date, true)}</span>
          </span>
          {open && <DueBadge date={j.install_date} today={today} />}
        </div>
        {!open && (
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            {t("closed_info", { date: dateTime(j.closed_at), who: j.closed_by_name ?? "—" })}
            {j.exception_reason ? ` · ${t("reason", { reason: j.exception_reason })}` : ""}
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <Person label={t("tailor")} name={j.tailor_name} />
          <Person label={t("seller")} name={j.seller_name} />
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <span className="row muted" style={{ gap: 8 }}>
            <Icon name="coin" size={20} className="tone-gold" /> {t("price")}
          </span>
          <span className="num" style={{ fontWeight: 600 }}>
            {money(j.price)}
          </span>
        </div>
      </section>

      {/* Progress */}
      <section className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ marginBottom: 18 }}>
          <Ring value={n} size={60} stroke={7} />
          <div className="grow">
            <div className="h2">{n === 6 ? t("all_steps_done") : next ? t("next_step", { step: `${checkNum(next)}. ${checkName(next)}` }) : t("steps_done", { n })}</div>
            <div className="muted small">{t("steps_of", { n })}</div>
          </div>
        </div>
        <StepPath job={j} next={open ? next : null} popped={popped} mine={(k) => open && canSet(me, j, k)} onTap={tapStep} />
      </section>

      {/* Steps */}
      <section className="card flush" style={{ marginBottom: 12 }}>
        {CHECK_KEYS.map((k) => (
          <StepRow key={k} job={j} k={k} me={me} today={today} onTap={() => tapStep(k)} onDelivered={() => act("delivered", {}, "delivered_saved")} busy={busy} />
        ))}
      </section>

      {/* Other actions */}
      {open && (
        <div className="stack" style={{ marginBottom: 12 }}>
          {!complete && decision && (decision.ok || decision.reason === "incomplete") && (
            <Button kind="plain" icon="flag" block onClick={() => setSheet({ type: "missing" })}>
              {t("btn_close_missing")}
            </Button>
          )}
          {canEdit(me, j) && (
            <Button kind="plain" icon="edit" block onClick={() => setSheet({ type: "edit" })}>
              {t("btn_edit")}
            </Button>
          )}
          {canCancel(me, j) && (
            <Button kind="danger" icon="ban" block onClick={() => setSheet({ type: "cancel" })}>
              {t("btn_cancel_job")}
            </Button>
          )}
        </div>
      )}

      {data.photos.length > 0 && <Photos ids={data.photos.map((p) => p.id)} />}
      <History events={data.history} onAll={() => setSheet({ type: "history" })} limit={5} />

      {/* Sheets */}
      {sheet?.type === "step" && (
        <StepSheet job={j} k={sheet.key} today={today} onClose={() => setSheet(null)} onSubmit={(v, x) => submitCheck(sheet.key, v, x)} />
      )}
      {sheet?.type === "missing" && (
        <MissingSheet
          job={j}
          me={me}
          onClose={() => setSheet(null)}
          onStep={(k) => setSheet({ type: "step", key: k })}
          onException={() => setSheet({ type: "exception" })}
        />
      )}
      {sheet?.type === "exception" && (
        <ExceptionSheet job={j} busy={busy} onClose={() => setSheet(null)} onSubmit={(reason) => act("close", { reason }, "closed_ok")} />
      )}
      {sheet?.type === "cancel" && <CancelSheet busy={busy} onClose={() => setSheet(null)} onYes={() => act("cancel", {}, "cancelled_ok")} />}
      {sheet?.type === "edit" && <EditSheet job={j} today={today} onClose={() => setSheet(null)} onSaved={refreshAll} />}
      {sheet?.type === "history" && (
        <Sheet label={t("history")} onClose={() => setSheet(null)}>
          <History events={data.history} />
        </Sheet>
      )}
      {party && <Celebrate canClose={canCloseNow} busy={busy} onClose={() => act("close", {}, "closed_ok")} onLater={() => setParty(false)} />}
    </div>
  );
}

function Person({ label, name }: { label: string; name: string }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <Avatar name={name} size={40} />
      <span className="grow">
        <span className="small muted" style={{ display: "block" }}>
          {label}
        </span>
        <span className="clip" style={{ fontWeight: 600, display: "block" }}>
          {shortName(name)}
        </span>
      </span>
    </div>
  );
}

function StepRow(p: { job: AppJob; k: CheckKey; me: AppUser; today: string; onTap: () => void; onDelivered: () => void; busy: boolean }) {
  const { job, k, me } = p;
  const c = checkOf(job, k);
  const s = stepState(c);
  const tone = toneOf(s);
  const mine = job.status === "open" && canSet(me, job, k);
  const paid = c.amount ?? 0;
  return (
    <div className="step-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 0 }}>
      <button className="row grow tap" style={{ alignItems: "flex-start", textAlign: "left", gap: 14 }} onClick={p.onTap} aria-label={`${checkNum(k)}. ${checkName(k)}: ${valueName(k, c.value)}`}>
        <span className={cx("tile-icon", `bg-${tone}`)}>
          <Icon name={STEP_ICON[k]} size={24} />
        </span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="row" style={{ justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>
              {checkNum(k)}. {checkName(k)}
            </span>
            <span className={`tone-${tone} small`} style={{ fontWeight: 600, textAlign: "right" }}>
              {valueName(k, c.value)}
            </span>
          </span>
          {c.updated_at && <span className="step-meta" style={{ display: "block" }}>{t("step_by", { who: shortName(c.updated_by_name ?? "—"), date: dateTime(c.updated_at) })}</span>}
          {!c.updated_at && <span className="step-meta" style={{ display: "block" }}>{t(k === "video" || k === "payment" ? "who_seller" : "who_tailor")}</span>}
          {c.note && <span className="step-note" style={{ display: "block" }}>{c.note}</span>}
          {c.promised_date && (
            <span className={cx("step-meta row", diffDays(p.today, c.promised_date) <= 0 && "tone-amber")} style={{ gap: 6 }}>
              <Icon name="calendar" size={16} /> {t("promised", { date: dateLong(c.promised_date) })}
            </span>
          )}
          {k === "materials" && c.delivered_claimed && (
            <span className="step-meta row tone-amber" style={{ gap: 6 }}>
              <Icon name="box" size={16} /> {t("delivered_note")}
            </span>
          )}
          {k === "payment" && c.value && (
            <span style={{ display: "block" }}>
              <span className="paybar" style={{ display: "block" }}>
                <i style={{ width: `${Math.min(100, job.price ? (paid / job.price) * 100 : 0)}%` }} />
              </span>
              <span className="step-meta" style={{ display: "block" }}>
                {t("paid_of", { paid: money(paid) })}
              </span>
              {paid < job.price && (
                <span className="step-meta tone-gold" style={{ display: "block", marginTop: 0, fontWeight: 600 }}>
                  {t("rest", { rest: money(job.price - paid) })}
                </span>
              )}
            </span>
          )}
        </span>
        <span style={{ alignSelf: "center" }}>{mine ? <Icon name="chevron" size={20} className="muted" /> : job.status === "open" ? <Icon name="lock" size={18} className="lock" /> : null}</span>
      </button>
      {k === "materials" && canClaim(me, job) && (
        <div style={{ marginTop: 12, paddingLeft: 58 }}>
          <Button kind="soft" size="sm" icon="box" disabled={p.busy} onClick={p.onDelivered}>
            {t("btn_delivered")}
          </Button>
        </div>
      )}
    </div>
  );
}

function MissingSheet(p: { job: AppJob; me: AppUser; onClose: () => void; onStep: (k: CheckKey) => void; onException: () => void }) {
  const missing = missingOf(p.job);
  useMainButton(isAdmin(p.me) ? { text: t("btn_exception"), onClick: p.onException } : HIDDEN);
  return (
    <Sheet label={t("close_missing_title")} onClose={p.onClose}>
      <div className="h2" style={{ marginBottom: 4 }}>
        {t("close_missing_title")}
      </div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        {t("close_missing_text")}
      </p>
      <div className="stack">
        {missing.map((k) => {
          const c = checkOf(p.job, k);
          const tone = toneOf(stepState(c));
          const mine = canSet(p.me, p.job, k);
          return (
            <button key={k} className="choice" onClick={() => (mine ? p.onStep(k) : undefined)} disabled={!mine} style={!mine ? { opacity: 1 } : undefined}>
              <span className={cx("tile-icon", `bg-${tone}`)}>
                <Icon name={STEP_ICON[k]} size={22} />
              </span>
              <span className="grow">
                {checkNum(k)}. {checkName(k)}
                <span className="small muted" style={{ display: "block", fontWeight: 400 }}>
                  {mine ? valueName(k, c.value) : t("locked_step", { who: whoSets(k) })}
                </span>
              </span>
              <Icon name={mine ? "chevron" : "lock"} size={20} className="muted" />
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function ExceptionSheet(p: { job: AppJob; busy: boolean; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState(false);
  const list = missingOf(p.job)
    .map((k) => `${checkNum(k)}. ${checkName(k)}`)
    .join(", ");
  useMainButton({
    text: t("btn_close"),
    progress: p.busy,
    onClick: () => (reason.trim().length >= 3 ? p.onSubmit(reason.trim()) : (haptic.warn(), setErr(true))),
  });
  return (
    <Sheet label={t("exception_title")} onClose={p.onClose}>
      <div className="h2" style={{ marginBottom: 6 }}>
        {t("exception_title")}
      </div>
      <p className="muted" style={{ margin: "0 0 14px" }}>
        {t("exception_text", { list })}
      </p>
      <textarea className="input" autoFocus maxLength={500} placeholder={t("exception_placeholder")} value={reason} onChange={(e) => (setReason(e.target.value), setErr(false))} />
      {err && <p className="error-text">{t("e_reason_required")}</p>}
    </Sheet>
  );
}

function CancelSheet(p: { busy: boolean; onClose: () => void; onYes: () => void }) {
  useMainButton({ text: t("cancel_yes"), tone: "red", progress: p.busy, onClick: p.onYes });
  return (
    <Sheet label={t("cancel_title")} onClose={p.onClose}>
      <div className="center" style={{ padding: "8px 0 8px" }}>
        <div className="tile-icon bg-red" style={{ margin: "0 auto 14px", width: 64, height: 64, borderRadius: 32 }}>
          <Icon name="ban" size={32} />
        </div>
        <div className="h2" style={{ marginBottom: 8 }}>
          {t("cancel_title")}
        </div>
        <p className="muted" style={{ margin: "0 auto 8px", maxWidth: 320 }}>
          {t("cancel_text")}
        </p>
        <Button kind="ghost" onClick={p.onClose}>
          {t("back")}
        </Button>
      </div>
    </Sheet>
  );
}

function EditSheet(p: { job: AppJob; today: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data } = useData<{ tailors: { id: number; name: string }[] }>("tailors");
  const [name, setName] = useState(p.job.name);
  const [date, setDate] = useState<string | null>(p.job.install_date);
  const [tailor, setTailor] = useState(p.job.tailor_id);
  const [price, setPrice] = useState<number | null>(p.job.price);
  const [busy, setBusy] = useState(false);

  async function save() {
    const changes: [string, string | number][] = [];
    if (name.trim() && name.trim() !== p.job.name) changes.push(["name", name.trim()]);
    if (date && date !== p.job.install_date) changes.push(["install_date", date]);
    if (tailor !== p.job.tailor_id) changes.push(["tailor_id", tailor]);
    if (price !== null && price !== p.job.price) changes.push(["price", price]);
    if (!changes.length) return p.onClose();
    setBusy(true);
    try {
      for (const [field, value] of changes) await post(`jobs/${p.job.id}/edit`, { field, value });
      toast(t("saved"));
      p.onSaved();
      p.onClose();
    } catch (e) {
      toast(errText(e), "err");
      p.onSaved();
    } finally {
      setBusy(false);
    }
  }
  useMainButton({ text: t("save"), progress: busy, onClick: save });

  return (
    <Sheet label={t("edit_title")} onClose={p.onClose}>
      <div className="h2" style={{ marginBottom: 16 }}>
        {t("edit_title")}
      </div>
      <div className="stack-lg">
        <div>
          <div className="label">{t("f_name")}</div>
          <input className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="label">{t("f_date")}</div>
          <p style={{ margin: "0 4px 10px", fontWeight: 600 }}>{dateLong(date, true)}</p>
          <DatePick value={date} onChange={setDate} today={p.today} quick={[[1, "d_tomorrow"], [3, "d_in3"], [7, "d_week"]]} />
        </div>
        <div>
          <div className="label">{t("f_tailor")}</div>
          <div className="row-wrap">
            {(data?.tailors ?? [{ id: p.job.tailor_id, name: p.job.tailor_name }]).map((x) => (
              <button key={x.id} className={cx("chip soft", tailor === x.id && "on")} onClick={() => (haptic.select(), setTailor(x.id))}>
                <Avatar name={x.name} size={28} /> {x.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label">{t("f_price")}</div>
          <MoneyInput label={t("f_price")} value={price} onChange={setPrice} />
        </div>
      </div>
    </Sheet>
  );
}

function Photos({ ids }: { ids: number[] }) {
  const [open, setOpen] = useState<string | null>(null);
  useBack(open ? () => setOpen(null) : null);
  return (
    <section className="card" style={{ marginBottom: 12 }}>
      <div className="label">
        {t("photos")} · {ids.length}
      </div>
      <div className="gallery">
        {ids.map((id) => (
          <Thumb key={id} id={id} onOpen={setOpen} />
        ))}
      </div>
      {open && (
        <div className="viewer" onClick={() => setOpen(null)} role="dialog" aria-label={t("photos")}>
          <img src={open} alt="" />
        </div>
      )}
    </section>
  );
}

function Thumb({ id, onOpen }: { id: number; onOpen: (u: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    photoUrl(id)
      .then((u) => live && setUrl(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <button className="thumb tap" onClick={() => url && onOpen(url)} aria-label={t("photos")}>
      {url ? <img src={url} alt="" loading="lazy" /> : <div className="skel" style={{ width: "100%", height: "100%", borderRadius: 0 }} />}
    </button>
  );
}

function eventText(e: AppEvent): string {
  switch (e.type) {
    case "check_set":
      return t("ev_check_set", { check: `${checkNum(e.check_key!)}. ${checkName(e.check_key!)}`, new: valueName(e.check_key!, e.new_value) });
    case "created":
    case "delivered_claimed":
    case "closed":
    case "closed_exception":
    case "cancelled":
      return t(`ev_${e.type}` as AppKey);
    default:
      if (e.type.startsWith("edited_")) {
        const field = e.type.slice(7);
        const fmt = (x: string | null) => (field === "install_date" ? dateLong(x) : field === "price" ? money(Number(x)) : (x ?? "—"));
        return t("ev_edited", { field: t(`field_${field}` as AppKey), old: fmt(e.old_value), new: fmt(e.new_value) });
      }
      return e.type;
  }
}

function History({ events, limit, onAll }: { events: AppEvent[]; limit?: number; onAll?: () => void }) {
  const list = [...events].reverse();
  const shown = limit ? list.slice(0, limit) : list;
  return (
    <section className={cx(!!limit && "card")}>
      <div className="label">{t("history")}</div>
      <div className="timeline">
        {shown.map((e) => (
          <div key={e.id} className="tl-item">
            <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{eventText(e)}</div>
            {e.note && e.type !== "check_set" && <div className="small" style={{ marginTop: 2 }}>{e.note}</div>}
            <div className="small muted">
              {e.user_name ?? ""} · {dateTime(e.created_at)}
            </div>
          </div>
        ))}
      </div>
      {limit && list.length > limit && onAll && (
        <Button kind="ghost" size="sm" onClick={onAll}>
          {t("show_all")} ({list.length})
        </Button>
      )}
    </section>
  );
}

function Celebrate(p: { canClose: boolean; busy: boolean; onClose: () => void; onLater: () => void }) {
  useBack(p.onLater);
  useMainButton(p.canClose ? { text: t("celebrate_close"), tone: "green", progress: p.busy, onClick: p.onClose } : { text: t("done"), onClick: p.onLater });
  useEffect(() => {
    if (reducedMotion()) return;
    import("canvas-confetti")
      .then(({ default: confetti }) => {
        const colors = ["#c2954a", "#d9ae62", "#2f9e62", "#4cc38a", "#ffffff"];
        confetti({ particleCount: 110, spread: 75, startVelocity: 42, origin: { y: 0.62 }, colors, disableForReducedMotion: true, zIndex: 90 });
        setTimeout(() => confetti({ particleCount: 60, spread: 110, origin: { y: 0.5 }, colors, zIndex: 90, disableForReducedMotion: true }), 260);
      })
      .catch(() => {});
  }, []);
  return (
    <div className="celebrate" role="dialog" aria-label={t("celebrate_title")}>
      <div className="card">
        <div className="medal">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </div>
        <div className="h1" style={{ marginBottom: 8 }}>
          {t("celebrate_title")}
        </div>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          {t("celebrate_text")}
        </p>
        {p.canClose && (
          <Button kind="ghost" onClick={p.onLater}>
            {t("celebrate_later")}
          </Button>
        )}
      </div>
    </div>
  );
}
