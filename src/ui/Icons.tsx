import type { SVGProps } from 'react';

export type IconName =
  | 'bolt' | 'coins' | 'chip' | 'flask' | 'shield' | 'grid' | 'chart' | 'users' | 'help'
  | 'sound' | 'mute' | 'menu' | 'close' | 'arrowRight' | 'plus' | 'minus' | 'battery'
  | 'sun' | 'wind' | 'flame' | 'droplet' | 'atom' | 'heat' | 'server' | 'lab' | 'tower'
  | 'link' | 'check' | 'lock' | 'spark' | 'trophy' | 'target' | 'play' | 'pause' | 'eye'
  | 'layers' | 'settings' | 'trash' | 'cursor' | 'map' | 'warning' | 'clock' | 'flag';

const PATHS: Record<IconName, React.ReactNode> = {
  bolt: <path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2Z" />,
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" />
      <path d="M9 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
      <ellipse cx="15" cy="12" rx="6" ry="3" />
    </>
  ),
  chip: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v6l-5.5 9A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3L14 9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  shield: <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="m7 15 4-5 3 3 5-7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.4a3 3 0 0 1 0 5.6M18 14.6c2 .7 3 2.4 3 5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.2a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.2 1-1.2 1.9v.4" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9.5h3L12 5v14l-5-4.5H4v-5Z" />
      <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5h3L12 5v14l-5-4.5H4v-5Z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  arrowRight: <path d="M4 12h15M14 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  battery: (
    <>
      <rect x="2.5" y="7" width="16" height="10" rx="2.4" />
      <path d="M21 10v4" />
      <path d="M5.5 10h6v4h-6z" fill="currentColor" stroke="none" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </>
  ),
  wind: (
    <>
      <path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12h14a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M3 16h5" />
    </>
  ),
  flame: <path d="M12 3c1.5 3.5-1 5-1 7 0 1.2.8 2 1.8 2 1.4 0 2.2-1.3 2.1-2.7 2 1.7 3.1 4 3.1 6 0 3.2-2.7 5.7-6 5.7S6 18.5 6 15.3C6 10.8 10.6 8.2 12 3Z" />,
  droplet: <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />,
  atom: (
    <>
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
    </>
  ),
  heat: (
    <>
      <path d="M8 20c-2 0-3.5-1.5-3.5-3.5 0-2.5 2.3-4 2.3-7.5 2.5 1.4 3.7 3.6 3.7 5.5 0 1.2.6 2 1.5 2" />
      <path d="M14 20c3 0 5-2 5-5 0-4-3.5-7-6.5-9 .5 3-1 4.5-2 5.5" />
      <path d="M3 20h18" />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="4" width="17" height="6" rx="1.6" />
      <rect x="3.5" y="14" width="17" height="6" rx="1.6" />
      <path d="M7 7h.01M7 17h.01M17 7h1M17 17h1" />
    </>
  ),
  lab: (
    <>
      <path d="M6 21V8l6-5 6 5v13" />
      <path d="M9 21v-5h6v5M9 10h.01M15 10h.01" />
    </>
  ),
  tower: (
    <>
      <path d="M12 3v18M7 21l5-8 5 8M6 8h12M8 5l8 3M8 16l8-6" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5L20 6.5" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  spark: <path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5-2-6.5L3.5 11 10 9l2-6.5Z" />,
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4v4h-4z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none" />
    </>
  ),
  play: <path d="M7 4.5 19 12 7 19.5v-15Z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  layers: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  cursor: <path d="m5 3 14 8-6 1.5L10 19 5 3Z" />,
  map: (
    <>
      <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5M12 17.5v.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
};

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
