/**
 * Utility-driven rival companies. Each AI ranks candidate actions by economic
 * value weighted by its personality, then executes the best legal ones until it
 * runs out of money or meaningful moves.
 */
import { BALANCE, PERSONAS, STRUCTURES, TECHS, TERRAINS, TECH_MAP } from './config';
import { applyAction, canLink, type GameAction } from './actions';
import { manhattan, neighbors4, playerStructures } from './board';
import { expectedGeneration, previewPlayer } from './grid';
import {
  canBuild,
  canClaim,
  canResearch,
  canUpgrade,
  isComputeKind,
  lineRange,
  techCost,
  UPGRADES,
} from './progression';
import type { GameState, Player, StructureKind, Tile } from './types';

const AI_ACTION_BUDGET = 14;

export function runAiTurns(state: GameState): void {
  for (const player of state.players) {
    if (!player.isAI || player.bankrupt) continue;
    takeTurn(state, player);
  }
}

function takeTurn(state: GameState, player: Player): void {
  const persona = PERSONAS[player.persona ?? 'helios'];
  const weights = persona.weights;
  player.policy = persona.policy;
  // Volt keeps a few flexible sites even when the fleet policy is different.
  if (player.persona === 'volt') {
    for (const { tile } of playerStructures(state, player.id)) {
      if (tile.structure && isComputeKind(tile.structure.kind) && !tile.structure.policy) {
        tile.structure.policy = (tile.x + tile.y) % 3 === 0 ? 'flex' : 'reliability';
      }
    }
  }
  let claims = 0;
  for (let step = 0; step < AI_ACTION_BUDGET; step++) {
    const report = previewPlayer(state, player.id).report;
    const load = report.load;
    const planningGen = expectedGeneration(state, player);
    const deficit = Math.max(0, load - report.served);
    const headroom = planningGen - load;
    const importing = report.imported;
    const stabilityLow = report.stability < 55 && report.islands.length > 0;
    const reserve = Math.max(120, player.credits * 0.12);
    const subs = playerStructures(state, player.id).filter(({ structure }) => structure.kind === 'substation').length;
    const dcKind = pickComputeTier(state, player);
    const dcDef = dcKind ? STRUCTURES[dcKind] : null;
    const dcNeed = (dcDef ? dcDef.mw : STRUCTURES.edge.mw) * 1.46;
    const dcCost = dcDef?.cost ?? Infinity;
    const genKind = pickGenerator(state, player, persona, stabilityLow || deficit > 6);
    const genCost = genKind ? STRUCTURES[genKind].cost : STRUCTURES.solar.cost;
    const freeTiles = state.tiles.filter((t) => t.owner === player.id && !t.structure).length;
    const usableFree = state.tiles.filter(
      (t) =>
        t.owner === player.id &&
        !t.structure &&
        t.terrain !== 'river' &&
        t.terrain !== 'mountain' &&
        (t.terrain !== 'geothermal' || player.techs.includes('enhancedGeothermal')),
    ).length;
    const savingForDc = headroom >= dcNeed && freeTiles > 0;
    const capitalTarget = savingForDc ? dcCost : genCost;

    // 1) Research is always worth it.
    if (tryResearch(state, player, persona)) continue;

    // 2) Reconnect islands and stranded assets.
    if (tryConnect(state, player)) continue;

    // 3) Keep the lights on (or cut an expensive import bill).
    if (deficit > 0.5 || stabilityLow || importing > Math.max(6, load * 0.15)) {
      if (genKind && tryBuild(state, player, genKind, reserve, freeTiles > 1)) continue;
      if (weights.storage > 0.9 && tryBuild(state, player, 'battery', reserve)) continue;
    }

    // 4) Compute is the business: build it whenever power headroom allows.
    if (dcKind && headroom >= dcNeed && player.credits >= dcCost && freeTiles > 0) {
      if (tryBuild(state, player, dcKind, 0)) continue;
    }

    // 5) Make sure there is land for the next data center.
    if (usableFree < 2 && player.credits > 260) {
      if (tryClaim(state, player)) {
        claims++;
        continue;
      }
    }

    // 6) Storage for flexibility companies and for wasted surplus.
    if (weights.storage >= 0.9 && (report.curtailed > 8 || stabilityLow) && player.credits > 900) {
      if (tryBuild(state, player, 'battery', reserve, freeTiles > 1)) continue;
    }

    // 7) Power for the next data center, once capital is there.
    if (headroom < dcNeed && player.credits > genCost + 250) {
      if (genKind && tryBuild(state, player, genKind, reserve, freeTiles > 1)) continue;
    }

    // 8) Expansion is opportunistic: only with capital past the next build.
    if (weights.expansion > 0.7 && claims < 2 && player.credits > capitalTarget * 1.35 && player.claims < 28) {
      if (tryClaim(state, player)) {
        claims++;
        continue;
      }
    }

    // 9) Research infrastructure when the tech pace is slow.
    const labs = playerStructures(state, player.id).filter(({ structure }) => structure.kind === 'lab').length;
    if (report.research < 48 && labs < 3 && player.credits > capitalTarget * 1.5 && freeTiles > 1) {
      if (tryBuild(state, player, 'lab', reserve, true)) continue;
    }

    // 10) Upgrades beat new footprint once unlocked.
    if (player.credits > Math.max(2200, capitalTarget * 1.3) && tryUpgrade(state, player)) continue;

    // 11) Substation when a single hub saturates.
    if (subs > 0 && load > subs * 105 && player.credits > 2600) {
      if (trySubstation(state, player)) continue;
    }

    // 12) Long-range outpost next to a resource cluster.
    if (player.credits > 3600 && weights.expansion > 0.9) {
      if (tryOutpost(state, player)) continue;
    }

    // 13) Never hoard: surplus capital goes into more generation.
    if (player.credits > 5200 && planningGen < load * 2.6) {
      if (genKind && tryBuild(state, player, genKind, reserve, freeTiles > 1)) continue;
    }
    break;
  }
}

function tryResearch(state: GameState, player: Player, persona: (typeof PERSONAS)[keyof typeof PERSONAS]): boolean {
  const affordable = TECHS.filter((tech) => canResearch(player, tech.id).ok);
  if (!affordable.length) return false;
  let best: { id: string; score: number } | null = null;
  for (const tech of affordable) {
    let score = persona.researchBias[tech.id] ?? 1;
    score *= 1 + (4 - tech.tier) * 0.12;
    if (tech.branch === 'compute') score *= persona.weights.compute;
    if (tech.branch === 'energy') score *= persona.weights.generation;
    if (tech.branch === 'optimization') score *= persona.weights.flexibility;
    if (tech.branch === 'infrastructure') score *= persona.weights.grid;
    // Unlocking a structure the AI currently wants is worth extra.
    if (tech.id === 'advancedCooling') score *= persona.weights.compute;
    if (tech.id === 'batteries') score *= persona.weights.storage * 1.4;
    if (!best || score > best.score) best = { id: tech.id, score };
  }
  if (!best) return false;
  if (player.research < techCost(TECH_MAP[best.id], player)) return false;
  const result = applyAction(state, player.id, { type: 'research', tech: best.id });
  return result.ok;
}

function pickGenerator(
  state: GameState,
  player: Player,
  persona: (typeof PERSONAS)[keyof typeof PERSONAS],
  firmFirst: boolean,
): StructureKind | null {
  const options: { kind: StructureKind; score: number }[] = [];
  const available: StructureKind[] = ['solar', 'wind', 'gas', 'hydro', 'geothermal', 'nuclear'];
  for (const kind of available) {
    const def = STRUCTURES[kind];
    if (def.requires && !player.techs.includes(def.requires)) continue;
    if (!state.tiles.some((t) => t.owner === player.id && !t.structure && def.terrains.includes(t.terrain))) continue;
    let score = 1;
    if (kind === 'solar') score = 1.35 * persona.weights.generation;
    if (kind === 'wind') score = 1.2 * persona.weights.generation;
    if (kind === 'gas') score = firmFirst ? 1.6 : 0.75;
    if (kind === 'hydro') score = 1.4;
    if (kind === 'geothermal') score = 1.5;
    if (kind === 'nuclear') score = firmFirst ? 2.2 : 1.1;
    score *= def.mw / Math.max(1, def.cost / 500);
    if (firmFirst && (kind === 'gas' || kind === 'nuclear' || kind === 'hydro' || kind === 'geothermal')) score *= 1.6;
    if (player.credits < def.cost) score *= 0.2;
    options.push({ kind, score });
  }
  options.sort((a, b) => b.score - a.score);
  return options[0]?.kind ?? null;
}

function pickComputeTier(state: GameState, player: Player): StructureKind | null {
  const order: StructureKind[] = ['gigafactory', 'hyperscale', 'edge'];
  for (const kind of order) {
    const def = STRUCTURES[kind];
    if (def.requires && !player.techs.includes(def.requires)) continue;
    if (player.credits < def.cost) continue;
    if (state.tiles.some((t) => t.owner === player.id && !t.structure && def.terrains.includes(t.terrain))) return kind;
  }
  return null;
}

function buildTileScore(state: GameState, player: Player, tile: Tile, kind: StructureKind): number {
  let score = 1;
  if (isComputeKind(kind)) {
    score = TERRAINS[tile.terrain].compute * 10 + (2 - TERRAINS[tile.terrain].cooling) * 8;
    score -= manhattan(tile, nearestSub(state, player, tile) ?? tile) * 0.6;
  } else if (kind === 'solar') {
    score = TERRAINS[tile.terrain].solar * 10 + (2 - TERRAINS[tile.terrain].cooling) * 2;
  } else if (kind === 'wind') {
    score = TERRAINS[tile.terrain].wind * 10;
  } else if (kind === 'gas') {
    score = 6 + (tile.terrain === 'basin' ? 6 : 0);
  } else if (kind === 'lab') {
    score = 8 - manhattan(tile, nearestSub(state, player, tile) ?? tile) * 0.5;
  } else if (kind === 'battery' || kind === 'substation') {
    score = 6;
  }
  if (tile.terrain === 'urban') score += 3;
  if (neighbors4(state, tile.x, tile.y).some((n) => n.owner === player.id && n.structure?.kind === 'substation')) score += 3;
  return score;
}

function nearestSub(state: GameState, player: Player, tile: Tile): Tile | null {
  let best: Tile | null = null;
  let bestD = Infinity;
  for (const { tile: t, structure } of playerStructures(state, player.id)) {
    if (structure.kind !== 'substation') continue;
    const d = manhattan(t, tile);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

function tryBuild(state: GameState, player: Player, kind: StructureKind, reserve: number, keepFreeTile = false): boolean {
  const def = STRUCTURES[kind];
  let best: { tile: Tile; score: number } | null = null;
  for (const tile of state.tiles) {
    if (tile.owner !== player.id) continue;
    if (tile.structure) continue;
    if (player.credits - def.cost < reserve && kind !== 'lab') continue;
    if (player.credits < def.cost) continue;
    const legality = canBuild(player, tile, kind);
    if (!legality.ok) continue;
    if (kind !== 'substation' && kind !== 'lab') {
      const sub = nearestSub(state, player, tile);
      if (!sub || manhattan(sub, tile) > BALANCE.attachRadius) continue;
    }
    const score = buildTileScore(state, player, tile, kind);
    if (!best || score > best.score) best = { tile, score };
  }
  if (!best) return false;
  if (keepFreeTile) {
    const free = state.tiles.filter((t) => t.owner === player.id && !t.structure).length;
    if (free <= 1) return false;
  }
  const action: GameAction = { type: 'build', x: best.tile.x, y: best.tile.y, kind };
  return applyAction(state, player.id, action).ok;
}

function tryUpgrade(state: GameState, player: Player): boolean {
  for (const { tile, structure } of playerStructures(state, player.id)) {
    if (!UPGRADES[structure.kind]) continue;
    if (!canUpgrade(player, tile).ok) continue;
    if (applyAction(state, player.id, { type: 'upgrade', x: tile.x, y: tile.y }).ok) return true;
  }
  return false;
}

function tryConnect(state: GameState, player: Player): boolean {
  const subs: Tile[] = [];
  for (const { tile, structure } of playerStructures(state, player.id)) {
    if (structure.kind === 'substation') subs.push(tile);
  }
  if (subs.length < 2) return false;
  const pairs: { a: Tile; b: Tile; cost: number; score: number }[] = [];
  for (let i = 0; i < subs.length; i++) {
    for (let j = i + 1; j < subs.length; j++) {
      const a = subs[i];
      const b = subs[j];
      if (manhattan(a, b) > lineRange(player)) continue;
      const legality = canLink(state, player, a, b);
      if (!legality.ok) continue;
      // Link the closest pair that is not already in the same island.
      pairs.push({ a, b, cost: legality.cost, score: 100 - manhattan(a, b) });
    }
  }
  if (!pairs.length) return false;
  pairs.sort((x, y) => y.score - x.score);
  const best = pairs[0];
  return applyAction(state, player.id, { type: 'link', ax: best.a.x, ay: best.a.y, bx: best.b.x, by: best.b.y }).ok;
}

function tryClaim(state: GameState, player: Player): boolean {
  const candidates: { tile: Tile; score: number }[] = [];
  for (const tile of state.tiles) {
    const legality = canClaim(state, player, tile);
    if (!legality.ok) continue;
    let score = 2;
    if (tile.structure?.owner === -1) score += 30;
    if (tile.terrain === 'geothermal') score += player.techs.includes('enhancedGeothermal') ? 9 : 4;
    else if (tile.terrain === 'river') score += player.techs.includes('hydropower') ? 8 : 1;
    else if (tile.terrain === 'basin') score += 6;
    else if (tile.terrain === 'urban') score += 5;
    else if (tile.terrain === 'mountain') score += 2;
    else if (tile.terrain === 'coast') score += 3;
    else if (tile.terrain === 'desert') score += 2;
    if (tile.structure && tile.structure.owner >= 0) score -= 20;
    const nearSub = nearestSub(state, player, tile);
    if (nearSub && manhattan(nearSub, tile) <= BALANCE.attachRadius) score += 3;
    score -= legality.cost * 0.008;
    candidates.push({ tile, score });
  }
  if (!candidates.length) return false;
  candidates.sort((a, b) => b.score - a.score);
  const pick = candidates[0];
  if (pick.score < 1) return false;
  return applyAction(state, player.id, { type: 'claim', x: pick.tile.x, y: pick.tile.y }).ok;
}

function trySubstation(state: GameState, player: Player): boolean {
  let best: { tile: Tile; score: number } | null = null;
  for (const tile of state.tiles) {
    if (tile.owner !== player.id || tile.structure) continue;
    if (!canBuild(player, tile, 'substation').ok) continue;
    let score = 0;
    for (const { tile: asset, structure } of playerStructures(state, player.id)) {
      if (structure.kind === 'substation') continue;
      if (manhattan(asset, tile) <= BALANCE.attachRadius) score += 1;
    }
    if (score <= 0) continue;
    if (!best || score > best.score) best = { tile, score };
  }
  if (!best) return false;
  return applyAction(state, player.id, { type: 'build', x: best.tile.x, y: best.tile.y, kind: 'substation' }).ok;
}

function tryOutpost(state: GameState, player: Player): boolean {
  const subs = playerStructures(state, player.id).filter((p) => p.structure.kind === 'substation');
  for (const tile of state.tiles) {
    if (tile.owner !== player.id || tile.structure) continue;
    if (!canBuild(player, tile, 'substation').ok) continue;
    if (subs.some((s) => manhattan(s.tile, tile) < 5)) continue;
    const resourceNearby = state.tiles.some(
      (t) =>
        manhattan(t, tile) <= BALANCE.attachRadius &&
        (t.terrain === 'geothermal' || t.terrain === 'river' || t.terrain === 'basin' || t.terrain === 'urban') &&
        !t.structure,
    );
    if (!resourceNearby) continue;
    if (applyAction(state, player.id, { type: 'build', x: tile.x, y: tile.y, kind: 'substation' }).ok) return true;
  }
  return false;
}

/** Health check used by tests: the AI must never perform an illegal action. */
export function aiSanityCheck(state: GameState): string[] {
  const problems: string[] = [];
  for (const player of state.players) {
    if (!player.isAI) continue;
    for (const tile of state.tiles) {
      if (tile.owner !== null && tile.owner !== player.id && tile.structure?.owner === player.id) {
        problems.push(`AI ${player.corp} owns a structure on a tile owned by ${tile.owner}`);
      }
    }
  }
  return problems;
}
