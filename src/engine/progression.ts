/** Technology effects and build/claim economics. */
import { BALANCE, COMPUTE_KINDS, STRUCTURES, TECH_MAP, TERRAINS } from './config';
import type { StructureDef } from './config';
import { isRevealed, manhattan, neighbors4 } from './board';
import type { GameState, Player, StructureKind, Tile, TechDef, Terrain } from './types';

export interface TechMods {
  compute: number;
  pue: number;
  solar: number;
  wind: number;
  gen: number;
  lineCap: number;
  lineRange: number;
  subCap: number;
  subCost: number;
  stability: number;
  flex: number;
  dcLoad: number;
  batteryEff: number;
}

export function techMods(player: Player): TechMods {
  const has = (id: string) => player.techs.includes(id);
  const mods: TechMods = {
    compute: 1,
    pue: 1,
    solar: 1,
    wind: 1,
    gen: 1,
    lineCap: 1,
    lineRange: 0,
    subCap: 1,
    subCost: 1,
    stability: 0,
    flex: 1,
    dcLoad: 1,
    batteryEff: BALANCE.batteryEfficiency,
  };
  if (has('efficientGpus')) mods.compute *= 1.08;
  if (has('advancedCooling')) mods.pue *= 0.94;
  if (has('liquidCooling')) mods.pue *= 0.92;
  if (has('aiAccelerators')) mods.compute *= 1.1;
  if (has('nextGenFactories')) mods.compute *= 1.06;
  if (has('improvedSolar')) mods.solar *= 1.15;
  if (has('advancedWind')) mods.wind *= 1.15;
  if (has('smartGridDispatch')) {
    mods.lineCap *= 1.1;
    mods.stability += 8;
  }
  if (has('advancedNuclear')) mods.stability += 6;
  if (has('gpuPowerManagement')) {
    mods.dcLoad *= 0.96;
    mods.compute *= 1.06;
  }
  if (has('workloadScheduling')) mods.flex *= 1.35;
  if (has('adaptiveInference')) {
    mods.compute *= 1.08;
    mods.stability += 3;
  }
  if (has('demandResponse')) mods.flex *= 1.45;
  if (has('autonomousFleet')) {
    mods.compute *= 1.15;
    mods.stability += 10;
  }
  if (has('hvTransmission')) mods.lineCap *= 1.6;
  if (has('modularSubstations')) {
    mods.subCap *= 1.4;
    mods.subCost *= 0.9;
  }
  if (has('gridInterconnection')) {
    mods.lineCap *= 1.25;
    mods.lineRange += 2;
  }
  if (has('advancedGridOps')) {
    mods.stability += 12;
    mods.gen *= 1.05;
  }
  return mods;
}

export function hasTech(player: Player, id: string): boolean {
  return player.techs.includes(id);
}

export function availableTechs(player: Player): TechDef[] {
  return Object.values(TECH_MAP).filter(
    (tech) => !player.techs.includes(tech.id) && tech.requires.every((r) => player.techs.includes(r)),
  );
}

export function techCost(tech: TechDef, player: Player): number {
  // Late-game research scales slightly with empire size to keep choices live.
  const sizePenalty = 1 + Math.min(0.35, player.stats.totalCompute / 4000);
  return Math.round(tech.cost * sizePenalty);
}

export function effectiveStructureCost(def: StructureDef, terrain: Terrain, player: Player): number {
  const mods = techMods(player);
  let cost = def.cost * TERRAINS[terrain].buildCost;
  if (def.kind === 'substation') cost *= mods.subCost;
  return Math.round(cost);
}

export function buildCost(player: Player, tile: Tile, kind: StructureKind): number {
  return effectiveStructureCost(STRUCTURES[kind], tile.terrain, player);
}

export function claimCost(player: Player): number {
  return BALANCE.claimBase + BALANCE.claimStep * player.claims;
}

export function lineCapacity(player: Player): number {
  return Math.round(160 * techMods(player).lineCap);
}

export function lineRange(player: Player): number {
  return BALANCE.linkRange + techMods(player).lineRange;
}

export function substationThroughput(player: Player): number {
  return Math.round(140 * techMods(player).subCap);
}

export function linkDistanceCost(a: { x: number; y: number }, b: { x: number; y: number }, corridorMult: number): number {
  const dist = manhattan(a, b);
  return Math.round((BALANCE.linkCostBase + BALANCE.linkCostPerTile * dist) * corridorMult);
}

export interface Legality {
  ok: boolean;
  reason: string;
  cost: number;
}

export function canBuild(player: Player, tile: Tile | null, kind: StructureKind): Legality {
  if (!tile) return { ok: false, reason: 'No tile selected', cost: 0 };
  const def = STRUCTURES[kind];
  const cost = buildCost(player, tile, kind);
  if (!TERRAINS[tile.terrain].land) return { ok: false, reason: 'Cannot build on water', cost };
  if (tile.owner !== player.id) return { ok: false, reason: 'Claim this tile first', cost };
  if (tile.structure) return { ok: false, reason: 'Tile already developed', cost };
  if (!def.terrains.includes(tile.terrain)) return { ok: false, reason: `Not buildable on ${TERRAINS[tile.terrain].name.toLowerCase()}`, cost };
  if (def.requires && !hasTech(player, def.requires)) {
    return { ok: false, reason: `Needs ${TECH_MAP[def.requires].name}`, cost };
  }
  if (player.credits < cost) return { ok: false, reason: 'Not enough credits', cost };
  return { ok: true, reason: '', cost };
}

export function canClaim(state: GameState, player: Player, tile: Tile | null): Legality {
  if (!tile) return { ok: false, reason: 'No tile selected', cost: 0 };
  const structure = tile.structure;
  const cost = structure && structure.owner === -1 ? BALANCE.captureCost : claimCost(player);
  if (!TERRAINS[tile.terrain].land) return { ok: false, reason: 'Open water cannot be claimed', cost };
  if (tile.owner === player.id) return { ok: false, reason: 'Already yours', cost };
  if (tile.owner !== null) return { ok: false, reason: 'Held by a rival', cost };
  if (!isRevealed(tile, player.id)) return { ok: false, reason: 'Uncharted territory', cost };
  if (structure && structure.owner !== -1) return { ok: false, reason: 'Rival asset', cost };
  const adjacent = neighbors4(state, tile.x, tile.y).some((n) => n.owner === player.id);
  if (!adjacent) return { ok: false, reason: 'Must border your territory', cost };
  if (player.credits < cost) return { ok: false, reason: 'Not enough credits', cost };
  return { ok: true, reason: '', cost };
}

export function canResearch(player: Player, techId: string): Legality {
  const tech = TECH_MAP[techId];
  if (!tech) return { ok: false, reason: 'Unknown technology', cost: 0 };
  const cost = techCost(tech, player);
  if (player.techs.includes(techId)) return { ok: false, reason: 'Already researched', cost };
  const missing = tech.requires.filter((r) => !player.techs.includes(r));
  if (missing.length) return { ok: false, reason: `Needs ${missing.map((m) => TECH_MAP[m].name).join(', ')}`, cost };
  if (player.research < cost) return { ok: false, reason: 'Not enough research', cost };
  return { ok: true, reason: '', cost };
}

/** Upgrade tier chain for compute assets. */
export const UPGRADES: Partial<Record<StructureKind, StructureKind>> = {
  edge: 'hyperscale',
  hyperscale: 'gigafactory',
};

export function upgradeCost(from: StructureKind, to: StructureKind, terrain: Terrain): number {
  const delta = STRUCTURES[to].cost - STRUCTURES[from].cost;
  return Math.max(200, Math.round(delta * 0.9 * TERRAINS[terrain].buildCost));
}

export function canUpgrade(player: Player, tile: Tile | null): Legality {
  if (!tile || !tile.structure) return { ok: false, reason: 'No asset selected', cost: 0 };
  const st = tile.structure;
  if (st.owner !== player.id) return { ok: false, reason: 'Not your asset', cost: 0 };
  const next = UPGRADES[st.kind];
  if (!next) return { ok: false, reason: 'Fully upgraded', cost: 0 };
  if (tile.owner !== player.id) return { ok: false, reason: 'Tile not yours', cost: 0 };
  const def = STRUCTURES[next];
  if (def.requires && !hasTech(player, def.requires)) return { ok: false, reason: `Needs ${TECH_MAP[def.requires].name}`, cost: 0 };
  if (!def.terrains.includes(tile.terrain)) return { ok: false, reason: 'Terrain does not support the upgrade', cost: 0 };
  const cost = upgradeCost(st.kind, next, tile.terrain);
  if (player.credits < cost) return { ok: false, reason: 'Not enough credits', cost };
  return { ok: true, reason: '', cost };
}

export function isComputeKind(kind: StructureKind): boolean {
  return COMPUTE_KINDS.includes(kind);
}

export function isGeneratorKind(kind: StructureKind): boolean {
  return STRUCTURES[kind].category === 'generation';
}
