/** The only mutation entry point for player and AI actions. */
import { STRUCTURES, TERRAINS } from './config';
import { corridorCost, manhattan, reveal, tileAt } from './board';
import { canBuild, canClaim, canResearch, canUpgrade, hasTech, lineRange, linkDistanceCost } from './progression';
import type { GameState, Player, Policy, Pos, StructureKind, Tile } from './types';

export type GameAction =
  | { type: 'claim'; x: number; y: number }
  | { type: 'build'; x: number; y: number; kind: StructureKind }
  | { type: 'upgrade'; x: number; y: number }
  | { type: 'link'; ax: number; ay: number; bx: number; by: number }
  | { type: 'research'; tech: string }
  | { type: 'policy'; policy: Policy; x?: number; y?: number };

export interface ActionResult {
  ok: boolean;
  reason: string;
  message: string;
  cost: number;
}

const fail = (reason: string): ActionResult => ({ ok: false, reason, message: '', cost: 0 });

export function canLink(state: GameState, player: Player, a: Pos, b: Pos): { ok: boolean; reason: string; cost: number } {
  const ta = tileAt(state, a.x, a.y);
  const tb = tileAt(state, b.x, b.y);
  if (!ta || !tb) return { ok: false, reason: 'Invalid corridor', cost: 0 };
  if (ta.structure?.kind !== 'substation' || ta.structure.owner !== player.id) return { ok: false, reason: 'Pick your own substation', cost: 0 };
  if (tb.structure?.kind !== 'substation' || tb.structure.owner !== player.id) return { ok: false, reason: 'Pick another of your substations', cost: 0 };
  if (a.x === b.x && a.y === b.y) return { ok: false, reason: 'Pick a second substation', cost: 0 };
  if (manhattan(a, b) > lineRange(player)) return { ok: false, reason: `Too far: maximum ${lineRange(player)} tiles`, cost: 0 };
  const exists = state.links.some(
    (l) =>
      l.owner === player.id &&
      ((l.a.x === a.x && l.a.y === a.y && l.b.x === b.x && l.b.y === b.y) ||
        (l.a.x === b.x && l.a.y === b.y && l.b.x === a.x && l.b.y === a.y)),
  );
  if (exists) return { ok: false, reason: 'Corridor already built', cost: 0 };
  const cost = linkDistanceCost(a, b, corridorCost(state, a, b));
  if (player.credits < cost) return { ok: false, reason: 'Not enough credits', cost };
  return { ok: true, reason: '', cost };
}

export function buildsFor(player: Player, tile: Tile): StructureKind[] {
  const unlocked = (kind: StructureKind) => {
    const req = STRUCTURES[kind].requires;
    return !req || hasTech(player, req);
  };
  return (Object.keys(STRUCTURES) as StructureKind[]).filter(
    (kind) => STRUCTURES[kind].terrains.includes(tile.terrain) && unlocked(kind),
  );
}

export function applyAction(state: GameState, playerId: number, action: GameAction): ActionResult {
  if (state.victory.over) return fail('The game is over');
  const player = state.players[playerId];
  if (!player || player.bankrupt) return fail('Company is not active');

  if (action.type === 'claim') {
    const tile = tileAt(state, action.x, action.y);
    const legality = canClaim(state, player, tile);
    if (!tile || !legality.ok) return fail(legality.reason);
    const wasNeutral = tile.structure?.owner === -1;
    player.credits -= legality.cost;
    tile.owner = playerId;
    if (wasNeutral && tile.structure) {
      tile.structure.owner = playerId;
      tile.structure.builtTurn = state.turn;
    }
    player.claims += 1;
    player.stats.claims += 1;
    // Claiming land extends the survey.
    reveal(state, playerId, tile.x, tile.y, 2);
    state.log.push({
      turn: state.turn,
      playerId,
      kind: 'claim',
      text: wasNeutral ? `${player.corp} seizes a stranded substation at ${tile.x},${tile.y}.` : `${player.corp} claims ${TERRAINS[tile.terrain].name.toLowerCase()} at ${tile.x},${tile.y}.`,
    });
    state.revision++;
    return { ok: true, reason: '', message: wasNeutral ? 'Substation captured' : 'Territory claimed', cost: legality.cost };
  }

  if (action.type === 'build') {
    const tile = tileAt(state, action.x, action.y);
    const legality = canBuild(player, tile, action.kind);
    if (!tile || !legality.ok) return fail(legality.reason);
    player.credits -= legality.cost;
    tile.structure = {
      kind: action.kind,
      owner: playerId,
      builtTurn: state.turn,
      ...(action.kind === 'battery' ? { charge: 0 } : {}),
    };
    player.stats.built += 1;
    state.log.push({
      turn: state.turn,
      playerId,
      kind: 'build',
      text: `${player.corp} builds ${STRUCTURES[action.kind].name} at ${tile.x},${tile.y}.`,
    });
    state.revision++;
    return { ok: true, reason: '', message: `${STRUCTURES[action.kind].name} online`, cost: legality.cost };
  }

  if (action.type === 'upgrade') {
    const tile = tileAt(state, action.x, action.y);
    const legality = canUpgrade(player, tile);
    if (!tile || !tile.structure || !legality.ok) return fail(legality.reason);
    const next = tile.structure.kind === 'edge' ? 'hyperscale' : 'gigafactory';
    player.credits -= legality.cost;
    const previousPolicy = tile.structure.policy;
    tile.structure = { kind: next, owner: playerId, builtTurn: state.turn, policy: previousPolicy };
    state.log.push({
      turn: state.turn,
      playerId,
      kind: 'build',
      text: `${player.corp} upgrades to ${STRUCTURES[next].name} at ${tile.x},${tile.y}.`,
    });
    state.revision++;
    return { ok: true, reason: '', message: `${STRUCTURES[next].name} commissioned`, cost: legality.cost };
  }

  if (action.type === 'link') {
    const a = { x: action.ax, y: action.ay };
    const b = { x: action.bx, y: action.by };
    const legality = canLink(state, player, a, b);
    if (!legality.ok) return fail(legality.reason);
    player.credits -= legality.cost;
    state.links.push({ owner: playerId, a, b });
    state.log.push({
      turn: state.turn,
      playerId,
      kind: 'grid',
      text: `${player.corp} energises a ${manhattan(a, b)}-tile transmission corridor.`,
    });
    state.revision++;
    return { ok: true, reason: '', message: 'Corridor energised', cost: legality.cost };
  }

  if (action.type === 'research') {
    const legality = canResearch(player, action.tech);
    if (!legality.ok) return fail(legality.reason);
    player.research -= legality.cost;
    player.techs.push(action.tech);
    player.stats.techs += 1;
    state.log.push({
      turn: state.turn,
      playerId,
      kind: 'research',
      text: `${player.corp} completes research: ${action.tech}.`,
    });
    state.revision++;
    return { ok: true, reason: '', message: 'Research complete', cost: legality.cost };
  }

  if (action.type === 'policy') {
    if (action.x !== undefined && action.y !== undefined) {
      const tile = tileAt(state, action.x, action.y);
      if (!tile?.structure || tile.structure.owner !== playerId) return fail('Select one of your assets');
      if (!STRUCTURES[tile.structure.kind].pue) return fail('Only data centers have operating policies');
      tile.structure.policy = action.policy;
    } else {
      player.policy = action.policy;
      for (const tile of state.tiles) {
        if (tile.structure?.owner === playerId && STRUCTURES[tile.structure.kind].pue) tile.structure.policy = undefined;
      }
    }
    state.revision++;
    return { ok: true, reason: '', message: 'Policy updated', cost: 0 };
  }

  return fail('Unknown action');
}
