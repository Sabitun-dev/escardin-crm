// Quick date buttons first ("Ertaga", "3 kun"…), then the phone's own calendar.
import { addDays, dateLong } from "../format";
import { type AppKey, t } from "../i18n";
import { Icon } from "./Icon";
import { Chip, cx } from "./kit";

export function DatePick({
  value,
  onChange,
  today,
  quick,
  allowNone,
}: {
  value: string | null;
  onChange: (d: string | null) => void;
  today: string;
  quick: [number, AppKey][];
  allowNone?: AppKey;
}) {
  const quickDates = quick.map(([n]) => addDays(today, n));
  const custom = value !== null && !quickDates.includes(value);
  return (
    <div className="row-wrap">
      {quick.map(([, key], i) => (
        <Chip key={key} soft on={value === quickDates[i]} onClick={() => onChange(quickDates[i]!)}>
          {t(key)}
        </Chip>
      ))}
      {/* The real date field lies invisibly over the chip, so a tap opens the phone's calendar on any phone */}
      <span style={{ position: "relative", display: "inline-flex" }}>
        <span className={cx("chip soft", custom && "on")} aria-hidden="true">
          <Icon name="calendar" size={18} />
          {custom ? dateLong(value) : t("d_pick")}
        </span>
        <input
          type="date"
          aria-label={t("d_pick")}
          value={custom ? value! : ""}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
        />
      </span>
      {allowNone && (
        <Chip soft on={value === null} onClick={() => onChange(null)}>
          {t(allowNone)}
        </Chip>
      )}
    </div>
  );
}
