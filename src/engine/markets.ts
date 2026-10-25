/** Weather, market clearing and event economy. */
import { BALANCE, WEATHERS } from './config';
import { makeRng } from './rng';
import type { EventMod, GameState, Player, WeatherDef } from './types';

export function weatherById(id: string): WeatherDef {
  return WEATHERS.find((w) => w.id === id) ?? WEATHERS[0];
}

/** Compute market clearing price: supply chasing demand pushes the price down. */
export function computePriceFor(demand: number, supply: number, base: number, mult: number): number {
  const ratio = demand > 0 ? supply / demand : 0;
  const raw = 1.12 / (0.6 + 0.8 * ratio);
  return Math.round(base * Math.min(1.3, Math.max(0.3, raw)) * mult * 10) / 10;
}

export function powerPriceFor(base: number, weather: WeatherDef, events: EventMod[], turn: number): number {
  const eventMult = events.reduce((m, e) => m * (e.powerPriceMult ?? 1), 1);
  const drift = 1 + BALANCE.powerDrift * Math.max(0, turn - 1);
  return Math.round(base * weather.powerPrice * eventMult * drift * 100) / 100;
}

export function eventMultiplier(events: EventMod[], field: keyof EventMod): number {
  return events.reduce((m, e) => m * ((e[field] as number | undefined) ?? 1), 1);
}

export function eventSum(events: EventMod[], field: keyof EventMod): number {
  return events.reduce((s, e) => s + ((e[field] as number | undefined) ?? 0), 0);
}

export function researchMultiplier(events: EventMod[]): number {
  return 1 + eventSum(events, 'researchBonus');
}

export function stabilityEventPenalty(events: EventMod[]): number {
  return eventSum(events, 'stabilityDelta');
}

export function flexEventMultiplier(events: EventMod[]): number {
  return 1 + eventSum(events, 'flexBonus');
}

export interface EventTemplate {
  id: string;
  label: string;
  desc: string;
  weight: number;
  turns: number;
  mods: Omit<EventMod, 'id' | 'label' | 'desc' | 'turnsLeft'>;
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: 'aiBoom', label: 'AI Demand Boom', desc: 'Enterprise inference contracts flood the market. Compute prices surge for two turns.',
    weight: 11, turns: 2, mods: { computePriceMult: 1.35 },
  },
  {
    id: 'computeGlut', label: 'Compute Glut', desc: 'A rival fleet floods spot capacity. Compute prices fall for two turns.',
    weight: 10, turns: 2, mods: { computePriceMult: 0.72 },
  },
  {
    id: 'solarOversupply', label: 'Solar Oversupply', desc: 'Midday power prices crater. Charge batteries, avoid exports.',
    weight: 8, turns: 1, mods: { powerPriceMult: 0.6 },
  },
  {
    id: 'fuelSpike', label: 'Fuel Price Spike', desc: 'Pipeline constraints double gas costs for two turns.',
    weight: 9, turns: 2, mods: { fuelMult: 1.9 },
  },
  {
    id: 'gridEmergency', label: 'Grid Emergency', desc: 'Reserve margins collapse. Flexible data centers earn heavy service payments; the grid is fragile.',
    weight: 8, turns: 1, mods: { flexBonus: 3.4, stabilityDelta: -10, powerPriceMult: 1.45 },
  },
  {
    id: 'talentBoom', label: 'Talent Boom', desc: 'A research diaspora lifts every R&D campus. +30% research for two turns.',
    weight: 7, turns: 2, mods: { researchBonus: 0.3 },
  },
  {
    id: 'subsidy', label: 'Compute Subsidy', desc: 'Industrial policy lands: every company receives a $260 grant.',
    weight: 6, turns: 1, mods: { grant: 260 },
  },
  {
    id: 'regulatory', label: 'Regulatory Review', desc: 'Reliability audits cut into margins and shake grid confidence.',
    weight: 5, turns: 1, mods: { stabilityDelta: -6, powerPriceMult: 1.12 },
  },
];

export function rollForecast(holder: { rng: number }): { weather: string; weight: number }[] {
  const rng = makeRng(holder);
  const first = rng.pick(WEATHERS);
  let second = rng.pick(WEATHERS);
  if (second.id === first.id) second = WEATHERS[(WEATHERS.indexOf(second) + 3) % WEATHERS.length];
  return [
    { weather: first.id, weight: 62 },
    { weather: second.id, weight: 38 },
  ];
}

export function pickForecastWeather(state: GameState): WeatherDef {
  const rng = makeRng(state);
  const candidates = state.market.forecast.map((f) => ({ weather: f.weather, weight: f.weight }));
  const chosen = rng.weighted(candidates);
  return weatherById(chosen.weather);
}

export function rollEvents(state: GameState): EventMod[] {
  const rng = makeRng(state);
  const out: EventMod[] = [];
  const active = new Set(state.market.events.map((e) => e.id));
  const rolls = rng.next();
  const count = rolls > 0.78 ? (rolls > 0.94 ? 2 : 1) : 0;
  for (let i = 0; i < count; i++) {
    const candidates = EVENT_TEMPLATES.filter((t) => !active.has(t.id) && !out.some((o) => o.id === t.id));
    if (!candidates.length) break;
    const template = rng.weighted(candidates.map((c) => ({ ...c, weight: c.weight })));
    out.push({ ...template.mods, id: template.id, label: template.label, desc: template.desc, turnsLeft: template.turns });
  }
  return out;
}

export function tickEvents(events: EventMod[]): EventMod[] {
  return events
    .map((e) => ({ ...e, turnsLeft: e.turnsLeft - 1 }))
    .filter((e) => e.turnsLeft > 0);
}

export function applyGrants(players: Player[], events: EventMod[]): number {
  const total = eventSum(events, 'grant');
  if (total > 0) for (const p of players) p.credits += total;
  return total;
}
