// Line icons (24×24, drawn with the text colour). Small and inline, so nothing extra downloads.
import type { JSX } from "react";

const P = {
  // the six steps
  fabric: (
    <>
      <circle cx="7" cy="8" r="4" />
      <circle cx="7" cy="8" r="1.2" />
      <path d="M7 4h11a1 1 0 0 1 1 1v14l-2.5-1.5L14 19l-2.5-1.5L9 19v-7" />
    </>
  ),
  needle: (
    <>
      {/* curtains tied back on a rod */}
      <path d="M2.5 3.5h19" />
      <path d="M4.5 3.5V20h4.5l-2.2-7.2C8.6 10.6 10.3 7.4 11 3.5" />
      <path d="M19.5 3.5V20H15l2.2-7.2c-1.8-2.2-3.5-5.4-4.2-9.3" />
    </>
  ),
  sparkle: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.3 15.3 20 20" />
      <path d="m7.8 10.6 1.9 1.9 3.6-3.7" />
    </>
  ),
  tag: (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.6" cy="7.6" r="1.4" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="6" width="13.5" height="12" rx="2.5" />
      <path d="m16 10.5 5.5-3.2v9.4L16 13.5" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 9.6v4.8" />
    </>
  ),
  // status
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11m0-11-11 11" />,
  alert: (
    <>
      <path d="M12 3.8 21.2 19.5H2.8z" />
      <path d="M12 10v4.2" />
      <path d="M12 17v.2" />
    </>
  ),
  dot: <circle cx="12" cy="12" r="3.6" />,
  // navigation and actions
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2m0 15v2M4.6 4.6 6 6m12 12 1.4 1.4M2.5 12h2m15 0h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  list: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8 9h8M8 12.5h8M8 16h5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  user: (
    <>
      <circle cx="12" cy="8.2" r="4" />
      <path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 7.5h3l1.8-2.5h6.4L17 7.5h3a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5z" />
      <circle cx="12" cy="13.3" r="3.8" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
      <path d="M5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4m8-4v4" />
    </>
  ),
  chevron: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  edit: (
    <>
      <path d="M4 20h4L19.5 8.5a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M6 18 18 6" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
      <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 19.5c.6-3.4 3.2-5.2 6.5-5.2s5.9 1.8 6.5 5.2" />
      <path d="M15.5 5.3a3.5 3.5 0 0 1 0 6.4M18 14.6c1.8.7 3.1 2.3 3.5 4.9" />
    </>
  ),
  invite: (
    <>
      <circle cx="10" cy="8.2" r="4" />
      <path d="M2.5 20.5c.8-4 3.8-6 7.5-6 1.4 0 2.6.3 3.7.8M18.5 14v6m-3-3h6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16v-4m4 4V8m4 8v-6" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.5 12h17M12 3.4c2.4 2.4 3.5 5.3 3.5 8.6s-1.1 6.2-3.5 8.6c-2.4-2.4-3.5-5.3-3.5-8.6s1.1-6.2 3.5-8.6z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.6 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.5" />
      <path d="M12 17v.2" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4v4.5H15" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4.5h11l-2 4 2 4H5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m4 17.5 4.5-4.5 3.5 3.5 2.5-2.5 5.5 5" />
    </>
  ),
} satisfies Record<string, JSX.Element>;

export type IconName = keyof typeof P;

export function Icon({ name, size = 24, stroke = 2, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  );
}
