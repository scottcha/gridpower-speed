/** Number and label formatting shared by the HUD. */
export function money(value: number): string {
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${sign}$${(v / 1000).toFixed(1)}k`;
  if (v >= 1000) return `${sign}$${(v / 1000).toFixed(2)}k`;
  return `${sign}$${Math.round(v)}`;
}

export function moneyExact(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString('en-US')}`;
}

export function number(value: number, digits = 0): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function mw(value: number): string {
  return `${number(value, value < 10 ? 1 : 0)} MW`;
}

export function cu(value: number): string {
  return `${number(value, value < 10 ? 1 : 0)} CU`;
}

export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function signed(value: number, formatter: (v: number) => string = money): string {
  return value > 0 ? `+${formatter(value)}` : value < 0 ? formatter(value) : formatter(0);
}

export function timeAgo(timestamp: number): string {
  if (!timestamp) return '';
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
