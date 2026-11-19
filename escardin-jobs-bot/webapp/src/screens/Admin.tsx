// "Boshqaruv" (admins): people, invites, report, backup.
import { useState } from "react";
import type { AppUser, InviteResponse, ReportResponse, ReportSection } from "../../../src/app-types";
import type { Role } from "../../../src/rules/permissions";
import { errText, useApp } from "../App";
import { post } from "../api";
import { invalidate, useData } from "../data";
import { dateLong, money } from "../format";
import { type AppKey, t } from "../i18n";
import { haptic, openTelegramLink } from "../tg";
import { Icon, type IconName } from "../ui/Icon";
import { HIDDEN, useMainButton, useToast } from "../ui/host";
import { Avatar, Badge, Button, Empty, Skel, SkelList, Tile, cx } from "../ui/kit";
import { Sheet } from "../ui/Sheet";

const ROLES: [Role, IconName][] = [
  ["seller", "user"],
  ["tailor", "needle"],
  ["admin", "shield"],
];

export function Admin() {
  const { go } = useApp();
  const toast = useToast();
  const { data } = useData<{ users: AppUser[] }>("users");
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = data?.users.filter((u) => u.is_active).length;

  async function backup() {
    setBusy(true);
    try {
      await post("backup");
      toast(t("backup_sent"));
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <header className="head">
        <h1 className="h1">{t("admin_title")}</h1>
      </header>
      <div className="stack stagger">
        <Tile icon="people" tone="gold" title={t("people")} sub={active === undefined ? "…" : t("people_n", { n: active })} onClick={() => go({ name: "users" })} />
        <Tile icon="invite" tone="green" title={t("invite")} sub={t("invite_sub")} onClick={() => setInvite(true)} />
        <Tile icon="chart" tone="amber" title={t("report")} sub={t("report_sub")} onClick={() => go({ name: "report" })} />
        <Tile icon="archive" tone="grey" title={t("backup")} sub={busy ? "…" : t("backup_sub")} onClick={busy ? undefined : backup} />
      </div>
      {invite && <InviteSheet onClose={() => setInvite(false)} />}
    </div>
  );
}

// ---------- people ----------

export function Users() {
  const { me } = useApp();
  const { data, reload } = useData<{ users: AppUser[] }>("users");
  const [open, setOpen] = useState<AppUser | null>(null);
  return (
    <div className="screen sub">
      <header className="head">
        <h1 className="h1">{t("people")}</h1>
      </header>
      {!data && <SkelList n={5} h={72} />}
      {data && (
        <div className="card flush">
          {data.users.map((u, i) => (
            <button
              key={u.id}
              className="row tap"
              style={{ width: "100%", textAlign: "left", padding: "12px 16px", minHeight: 68, borderTop: i ? "1px solid var(--line)" : undefined, opacity: u.is_active ? 1 : 0.6 }}
              onClick={() => (haptic.tap(), setOpen(u))}
            >
              <Avatar name={u.name} size={44} />
              <span className="grow">
                <span className="clip" style={{ display: "block", fontWeight: 600 }}>
                  {u.name} {u.id === me.id && <span className="muted small">· {t("you")}</span>}
                </span>
                <span className="small muted row" style={{ gap: 6 }}>
                  {t(`role_${u.role}` as AppKey)} · <StatusWord u={u} />
                </span>
              </span>
              <Icon name="chevron" size={20} className="muted" />
            </button>
          ))}
        </div>
      )}
      {open && <UserSheet user={open} self={open.id === me.id} onClose={() => setOpen(null)} onChanged={() => (reload(), invalidate("users"))} />}
    </div>
  );
}

function StatusWord({ u }: { u: AppUser }) {
  const [tone, icon, key]: [string, IconName, AppKey] = !u.is_active
    ? ["grey", "ban", "user_inactive"]
    : !u.is_reachable
      ? ["amber", "alert", "user_unreachable"]
      : ["green", "check", "user_active"];
  return (
    <span className={`row tone-${tone}`} style={{ gap: 3, fontWeight: 600 }}>
      <Icon name={icon} size={14} stroke={2.6} /> {t(key)}
    </span>
  );
}

function UserStatus({ u }: { u: AppUser }) {
  if (!u.is_active) return <Badge tone="grey" icon="ban">{t("user_inactive")}</Badge>;
  if (!u.is_reachable) return <Badge tone="amber" icon="alert">{t("user_unreachable")}</Badge>;
  return <Badge tone="green" icon="check">{t("user_active")}</Badge>;
}

function UserSheet({ user, self, onClose, onChanged }: { user: AppUser; self: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [u, setU] = useState(user);
  const [busy, setBusy] = useState(false);
  useMainButton(HIDDEN);

  async function change(path: string, body: unknown, next: AppUser) {
    setBusy(true);
    const prev = u;
    setU(next);
    try {
      await post(`users/${u.id}/${path}`, body);
      toast(t("saved"));
      onChanged();
    } catch (e) {
      setU(prev);
      toast(errText(e), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet label={u.name} onClose={onClose}>
      <div className="sheet-head">
        <Avatar name={u.name} size={56} />
        <div className="grow">
          <div className="h2">{u.name}</div>
          <div style={{ marginTop: 6 }}>
            <UserStatus u={u} />
          </div>
        </div>
      </div>
      {self ? (
        <p className="muted">{t("e_self_forbidden")}</p>
      ) : (
        <>
          <div className="sheet-step">{t("make_role")}</div>
          <div className="stack">
            {ROLES.map(([r, icon]) => (
              <button key={r} className={cx("choice tone-gold", u.role === r && "on")} disabled={busy} onClick={() => u.role !== r && change("role", { role: r }, { ...u, role: r })}>
                <span className="tile-icon bg-gold">
                  <Icon name={icon} size={22} />
                </span>
                <span className="grow" style={{ color: "var(--text)" }}>
                  {t(`role_${r}` as AppKey)}
                </span>
                {u.role === r && <Icon name="check" size={20} />}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <Button
              kind={u.is_active ? "danger" : "green"}
              icon={u.is_active ? "ban" : "refresh"}
              block
              disabled={busy}
              onClick={() => change("active", { active: !u.is_active }, { ...u, is_active: !u.is_active })}
            >
              {t(u.is_active ? "deactivate" : "activate")}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---------- invite ----------

function InviteSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [role, setRole] = useState<Role>("tailor");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [done, setDone] = useState<InviteResponse | null>(null);

  async function create() {
    if (!name.trim()) return haptic.warn(), setErr(true);
    setBusy(true);
    try {
      setDone(await post<InviteResponse>("invites", { role, name: name.trim() }));
      haptic.success();
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setBusy(false);
    }
  }

  const share = () =>
    done && openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(done.link)}&text=${encodeURIComponent(t("share_text"))}`);
  const copy = async () => {
    if (!done) return;
    try {
      await navigator.clipboard.writeText(done.link);
      toast(t("copied"));
    } catch {
      toast(done.link, "info");
    }
  };

  useMainButton(done ? { text: t("share"), onClick: share } : { text: t("invite"), progress: busy, onClick: create });

  return (
    <Sheet label={t("invite")} onClose={onClose}>
      {!done ? (
        <>
          <div className="h2" style={{ marginBottom: 4 }}>
            {t("invite")}
          </div>
          <div className="sheet-step" style={{ marginTop: 16 }}>
            {t("invite_role")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {ROLES.map(([r, icon]) => (
              <button
                key={r}
                className={cx("choice tone-gold", role === r && "on")}
                style={{ flexDirection: "column", justifyContent: "center", gap: 6, minHeight: 92, padding: 8, textAlign: "center", fontSize: 15 }}
                aria-pressed={role === r}
                onClick={() => (haptic.select(), setRole(r))}
              >
                <Icon name={icon} size={26} />
                <span style={{ color: "var(--text)" }}>{t(`role_${r}` as AppKey)}</span>
              </button>
            ))}
          </div>
          <div className="sheet-step">{t("invite_name")}</div>
          <input className="input" maxLength={60} placeholder={t("invite_name_ph")} value={name} onChange={(e) => (setName(e.target.value), setErr(false))} />
          {err && <p className="error-text">{t("e_bad_input")}</p>}
        </>
      ) : (
        <div className="center">
          <div className="medal" style={{ width: 72, height: 72, boxShadow: "0 0 0 8px var(--green-soft)" }}>
            <Icon name="check" size={36} stroke={2.6} />
          </div>
          <div className="h2" style={{ marginBottom: 6 }}>
            {t("invite_ready")}
          </div>
          <p className="muted" style={{ margin: "0 0 14px" }}>
            {t("invite_ready_text", { name: done.name })}
          </p>
          <div className="card" style={{ background: "var(--bg)", boxShadow: "none", wordBreak: "break-all", fontSize: 15, textAlign: "left" }}>
            {done.link}
          </div>
          <div style={{ marginTop: 12 }}>
            <Button kind="soft" icon="copy" block onClick={copy}>
              {t("copy")}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ---------- report ----------

const SECTIONS: [ReportSection, IconName, "red" | "amber" | "gold" | "grey"][] = [
  ["attention", "flag", "red"],
  ["overdue", "clock", "red"],
  ["problems", "alert", "red"],
  ["materials", "fabric", "amber"],
  ["unpaid", "coin", "gold"],
  ["noVideo", "video", "grey"],
  ["noLabel", "tag", "grey"],
];

export function Report() {
  const { go } = useApp();
  const { data } = useData<ReportResponse>("report");
  const [open, setOpen] = useState<ReportSection | null>("attention");
  if (!data)
    return (
      <div className="screen sub">
        <div className="stack">
          <Skel h={110} r={18} />
          <SkelList n={5} h={72} />
        </div>
      </div>
    );
  return (
    <div className="screen sub">
      <header className="head">
        <h1 className="h1">{t("report")}</h1>
        <div className="muted">{dateLong(data.today, true)}</div>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="card">
          <div className="small muted">{t("r_open")}</div>
          <div className="big num">{data.open}</div>
        </div>
        <div className="card">
          <div className="small muted">{t("r_debt")}</div>
          <div className="h2 num tone-gold" style={{ marginTop: 6 }}>
            {money(data.debt)}
          </div>
        </div>
      </div>
      <div className="stack">
        {SECTIONS.map(([key, icon, tone]) => {
          const list = data.sections[key];
          const isOpen = open === key;
          return (
            <section key={key} className="card flush">
              <button className="tile tap" aria-expanded={isOpen} onClick={() => (haptic.select(), setOpen(isOpen ? null : key))}>
                <span className={cx("tile-icon", `bg-${list.length ? tone : "green"}`)}>
                  <Icon name={list.length ? icon : "check"} size={24} />
                </span>
                <span className="grow tile-title">{t(`r_${key}` as AppKey)}</span>
                <span className="h2 num">{list.length}</span>
                <Icon name="chevron" size={20} className={cx("chev", isOpen && "chev-open")} />
              </button>
              {isOpen && (
                <div style={{ padding: "0 16px 12px" }}>
                  {list.length === 0 && <p className="muted small" style={{ margin: "0 0 4px" }}>{t("r_none")}</p>}
                  {list.slice(0, 30).map((j) => (
                    <button key={j.id} className="row tap" style={{ width: "100%", textAlign: "left", minHeight: 52, borderTop: "1px solid var(--line)" }} onClick={() => go({ name: "job", id: j.id })}>
                      <span className="grow clip">{j.name}</span>
                      <span className="small muted num">{dateLong(j.install_date)}</span>
                      <span className="small num" style={{ fontWeight: 600, minWidth: 34, textAlign: "right" }}>
                        {j.progress}/6
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {data.open === 0 && <Empty icon="check" title={t("happy_title")} />}
    </div>
  );
}
