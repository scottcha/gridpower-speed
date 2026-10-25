import { useId } from 'react';

export interface Series {
  values: number[];
  color: string;
  label: string;
  fill?: boolean;
}

export function Sparkline({
  series,
  height = 110,
  min,
  max,
  showDots = false,
}: {
  series: Series[];
  height?: number;
  min?: number;
  max?: number;
  showDots?: boolean;
}) {
  const uid = useId().replace(/[:]/g, '');
  const width = 320;
  const all = series.flatMap((s) => s.values);
  const lo = min ?? Math.min(...all, 0);
  const hi = max ?? Math.max(...all, 1);
  const span = Math.max(0.0001, hi - lo);
  const x = (i: number, n: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * (width - 12) + 6);
  const y = (v: number) => height - 8 - ((v - lo) / span) * (height - 18);

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={series.map((s) => s.label).join(', ')}>
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`${uid}-g${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1="0" x2={width} y1={height * t} y2={height * t} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}
      {series.map((s, i) => {
        const n = s.values.length;
        if (n === 0) return null;
        const points = s.values.map((v, idx) => `${x(idx, n)},${y(v)}`).join(' ');
        return (
          <g key={i}>
            {s.fill !== false && (
              <polygon points={`6,${height - 8} ${points} ${width - 6},${height - 8}`} fill={`url(#${uid}-g${i})`} />
            )}
            <polyline points={points} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {showDots && n > 0 && <circle cx={x(n - 1, n)} cy={y(s.values[n - 1])} r="3" fill={s.color} />}
          </g>
        );
      })}
    </svg>
  );
}
