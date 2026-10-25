/** UI-facing derivations: projections, objectives, labels. Cached per revision. */
import { BALANCE, POLICIES, STRUCTURES, TERRAINS } from '../engine/config';
import { attachedSubstation, playerStructures } from '../engine/board';
import { effectivePue, islandsOf, policyUtilization, previewPlayer } from '../engine/grid';
import { availableTechs, canClaim, hasTech, techCost, techMods } from '../engine/progression';
import type { GameState, PlayerTurnReport, StructureKind, Tile } from '../engine/types';
import type { IconName } from './Icons';

const cache = new Map<string, PlayerTurnReport>();

export function projectionFor(game: GameState, playerId: number): PlayerTurnReport {
  const key = `${game.seed}:${game.revision}:${playerId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 24) cache.clear();
  const result = previewPlayer(game, playerId).report;
  cache.set(key, result);
  return result;
}

export function projection(game: GameState): PlayerTurnReport {
  return projectionFor(game, 0);
}

export function computeShare(state: GameState, playerId: number): number {
  return state.victory.progress[playerId]?.computeShare ?? 0;
}

export function netOf(report: PlayerTurnReport): number {
  return report.computeRevenue + report.powerRevenue - report.powerCost - report.fuelCost - report.maintenance;
}

/** Live projection: dispatch costs plus compute revenue at the current clearing price. */
export function projectedNet(state: GameState, report: PlayerTurnReport): number {
  const priceMult = state.market.events.reduce((m, e) => m * (e.computePriceMult ?? 1), 1);
  return netOf(report) + report.compute * state.market.computePrice * priceMult;
}

/** Live market share using every company's current build-out. */
export function projectedShare(state: GameState, report: PlayerTurnReport): number {
  let total = report.compute;
  for (const player of state.players) {
    if (player.id === 0 || player.bankrupt) continue;
    total += projectionFor(state, player.id).compute;
  }
  return total > 0 ? report.compute / total : 0;
}

export function opexOf(report: PlayerTurnReport): number {
  return report.powerCost + report.fuelCost + report.maintenance;
}

export function stabilityColor(stability: number): string {
  if (stability >= 80) return '#5df0b1';
  if (stability >= 60) return '#ffd166';
  return '#ff7a59';
}

export function utilisationColor(util: number): string {
  if (util >= 0.95) return '#5df0b1';
  if (util >= 0.5) return '#ffd166';
  return '#ff7a59';
}

export function structureIcon(kind: StructureKind): IconName {
  switch (kind) {
    case 'solar':
      return 'sun';
    case 'wind':
      return 'wind';
    case 'gas':
      return 'flame';
    case 'hydro':
      return 'droplet';
    case 'nuclear':
      return 'atom';
    case 'geothermal':
      return 'heat';
    case 'battery':
      return 'battery';
    case 'substation':
      return 'tower';
    case 'lab':
      return 'lab';
    case 'gigafactory':
      return 'spark';
    default:
      return 'server';
  }
}

export function categoryColor(kind: StructureKind): string {
  const cat = STRUCTURES[kind].category;
  if (cat === 'generation') return '#7fe6ff';
  if (cat === 'storage') return '#8ef0c2';
  if (cat === 'network') return '#a9c7e8';
  if (cat === 'research') return '#d3b4ff';
  return '#ffd166';
}

export interface Objective {
  icon: IconName;
  title: string;
  hint: string;
}

export function nextObjectives(state: GameState): Objective[] {
  const player = state.players[0];
  const report = projection(state);
  const out: Objective[] = [];
  const claims = player.claims;
  const generators = playerStructures(state, 0).filter(({ structure }) => STRUCTURES[structure.kind].category === 'generation');
  const centers = playerStructures(state, 0).filter(({ structure }) => STRUCTURES[structure.kind].category === 'compute');
  const unserved = Math.max(0, report.load - report.served);
  const neutral = state.tiles.find((t) => t.structure?.owner === -1 && (t.revealed & 1) !== 0 && canClaim(state, player, t).ok);

  if (claims === 0) {
    out.push({ icon: 'flag', title: 'Claim your first tile', hint: 'Shift-click a bordering tile, or select it and press Claim. Land is the base of every empire.' });
  }
  if (unserved > 0.5) {
    out.push({ icon: 'bolt', title: `Cover ${Math.round(unserved)} MW of shortfall`, hint: 'Build generation inside a substation radius, or import from the market at a premium.' });
  }
  if (generators.length < 2) {
    out.push({ icon: 'sun', title: 'Add a second power source', hint: 'Solar is cheap; wind rides the front. Power is only worth what reaches your racks.' });
  }
  if (centers.length < 2 && player.credits > 900) {
    out.push({ icon: 'server', title: 'Build another data center', hint: 'Compute is the product. Check projected headroom before you break ground.' });
  }
  const techs = availableTechs(player);
  const cheapest = techs.map((t) => techCost(t, player)).sort((a, b) => a - b)[0];
  if (cheapest !== undefined && player.research >= cheapest) {
    out.push({ icon: 'flask', title: 'Spend your research points', hint: `${player.research.toFixed(0)} RP banked. Open the tech tree with T.` });
  }
  if (report.research < 22 && player.credits > 900) {
    out.push({ icon: 'lab', title: 'Fund an R&D campus', hint: 'Research compounds: efficiency, storage and transmission all pay back.' });
  }
  if (islandsOf(state, 0).length > 1) {
    out.push({ icon: 'link', title: 'Merge your grid islands', hint: 'Select a substation and energise a corridor so power can cross.' });
  }
  if (neutral) {
    out.push({ icon: 'target', title: 'Capture a stranded substation', hint: `A neutral hub sits at ${neutral.x},${neutral.y}. Claim it to inherit its site.` });
  }
  if (hasTech(player, 'batteries') && report.curtailed > 6) {
    out.push({ icon: 'battery', title: 'Store the surplus', hint: `${Math.round(report.curtailed)} MW is curtailed. Batteries turn it into evening capacity.` });
  }
  if (player.credits > 2500 && report.islands.some((i) => i.stability < 70)) {
    out.push({ icon: 'shield', title: 'Stabilise the grid', hint: 'Firm capacity, batteries and reliability policies raise stability and protect compute output.' });
  }
  if (!out.length) {
    out.push({ icon: 'chart', title: 'Scale the fleet', hint: 'Upgrade edge sites to hyperscale campuses, then claim land for the next gigafactory.' });
  }
  return out.slice(0, 3);
}

export function generatorMix(state: GameState): { kind: StructureKind; label: string; mw: number; color: string }[] {
  const kinds: StructureKind[] = ['solar', 'wind', 'gas', 'hydro', 'nuclear', 'geothermal'];
  const rows = kinds.map((kind) => {
    const mw = playerStructures(state, 0)
      .filter(({ structure }) => structure.kind === kind)
      .reduce((sum, { tile }) => {
        const def = STRUCTURES[kind];
        const terrain = TERRAINS[tile.terrain];
        let out = def.mw;
        if (kind === 'solar') out *= terrain.solar * state.weather.solar;
        if (kind === 'wind') out *= terrain.wind * state.weather.wind;
        if (kind === 'gas') out *= tile.terrain === 'basin' ? 1.15 : 1;
        if (kind === 'hydro') out *= state.weather.hydro;
        return sum + out;
      }, 0);
    return { kind, label: STRUCTURES[kind].short, mw, color: kind === 'solar' ? '#ffd166' : kind === 'wind' ? '#9fe0ff' : kind === 'gas' ? '#ff9f5c' : kind === 'hydro' ? '#5fd3ff' : kind === 'nuclear' ? '#b7f0c9' : '#ff9b6a' };
  });
  return rows.filter((r) => r.mw > 0.5);
}

export interface DcStats {
  request: number;
  pue: number;
  util: number;
  delivered: number;
  it: number;
  compute: number;
  policy: keyof typeof POLICIES;
  connected: boolean;
}

export function dcStats(state: GameState, tile: Tile): DcStats {
  const player = state.players[0];
  const st = tile.structure;
  if (!st || !STRUCTURES[st.kind].pue) {
    return { request: 0, pue: 1, util: 0, delivered: 0, it: 0, compute: 0, policy: player.policy, connected: false };
  }
  const ctx = { powerPrice: state.market.powerPrice, computePrice: state.market.computePrice, fuelMult: 1 };
  const pue = effectivePue(state, player, tile, st.kind);
  const utilRequest = policyUtilization(st.policy ?? player.policy, ctx.computePrice, ctx.powerPrice);
  const request = STRUCTURES[st.kind].mw * pue * utilRequest * techMods(player).dcLoad;
  const util = projection(state).dcUtil[`${tile.x},${tile.y}`] ?? 0;
  const delivered = request * util;
  const it = delivered / pue;
  const compute = it * (STRUCTURES[st.kind].eff ?? 1) * techMods(player).compute * TERRAINS[tile.terrain].compute;
  return {
    request,
    pue,
    util,
    delivered,
    it,
    compute,
    policy: st.policy ?? player.policy,
    connected: attachedSubstation(state, tile, 0, BALANCE.attachRadius) !== null,
  };
}

export function batteryStats(tile: Tile): { soc: number; storage: number; rate: number } {
  const st = tile.structure;
  return {
    soc: st?.charge ?? 0,
    storage: STRUCTURES.battery.storage ?? 48,
    rate: STRUCTURES.battery.rate ?? 24,
  };
}
