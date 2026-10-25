import { describe, expect, it } from 'vitest';
import { BALANCE, STRUCTURES, TERRAINS, WEATHERS } from '../src/engine/config';
import { createGame } from '../src/engine/worldgen';
import { applyAction, canLink } from '../src/engine/actions';
import { canBuild, canClaim, canResearch, claimCost, techCost } from '../src/engine/progression';
import { computePriceFor, powerPriceFor, weatherById } from '../src/engine/markets';
import { dispatchPlayer, expectedGeneration, islandsOf, previewPlayer, structureOutput } from '../src/engine/grid';
import { firmCapacity } from '../src/engine/simulation';
import { endTurn, evaluateVictory, resolveTurn } from '../src/engine/simulation';
import { serialize, parseSave, importSave, exportSave } from '../src/engine/save';
import { runHeadlessMatch } from '../src/engine/headless';
import { aiSanityCheck } from '../src/engine/ai';
import { playerStructures, tileAt } from '../src/engine/board';
import type { GameState, Player, PlayerTurnReport, StructureKind, Terrain } from '../src/engine/types';

function fresh(seed = 4242, size = 16, maxTurns = 40): GameState {
  return createGame({ seed, size, maxTurns, playerName: 'Test Grid', credits: BALANCE.startCredits });
}

function startTiles(state: GameState, playerId = 0) {
  const structures = playerStructures(state, playerId);
  return {
    sub: structures.find((s) => s.structure.kind === 'substation')!.tile,
    dc: structures.find((s) => s.structure.kind === 'edge')!.tile,
    solar: structures.find((s) => s.structure.kind === 'solar')!.tile,
  };
}

function place(state: GameState, x: number, y: number, kind: StructureKind, owner: number, terrain: Terrain = 'plains'): void {
  const tile = tileAt(state, x, y)!;
  tile.terrain = terrain;
  tile.owner = owner;
  tile.structure = { kind, owner, builtTurn: state.turn, ...(kind === 'battery' ? { charge: 0 } : {}) };
}

function emptyPlayer(state: GameState, id: number): Player {
  return state.players[id];
}

describe('world generation', () => {
  it('is deterministic per seed and varied across seeds', () => {
    const a = fresh(99);
    const b = fresh(99);
    const c = fresh(100);
    expect(serialize(a)).toBe(serialize(b));
    expect(serialize(a)).not.toBe(serialize(c));
  });

  it('gives every company a connected starter kit and surveyed ground', () => {
    for (const seed of [7, 31, 77]) {
    const state = fresh(seed, 18);
    for (const player of state.players) {
      const { sub, dc, solar } = startTiles(state, player.id);
      expect(sub.structure?.kind).toBe('substation');
      expect(dc.structure?.kind).toBe('edge');
      expect(solar.structure?.kind).toBe('solar');
      // Starting assets must obey the same terrain rules as player-built ones.
      expect(STRUCTURES.edge.terrains).toContain(dc.terrain);
      expect(STRUCTURES.solar.terrains).toContain(solar.terrain);
      expect(Math.abs(dc.x - sub.x) + Math.abs(dc.y - sub.y)).toBeLessThanOrEqual(BALANCE.attachRadius);
      expect(Math.abs(solar.x - sub.x) + Math.abs(solar.y - sub.y)).toBeLessThanOrEqual(BALANCE.attachRadius);
      const owned = state.tiles.filter((t) => t.owner === player.id);
      expect(owned.length).toBeGreaterThanOrEqual(3);
      expect(state.tiles.filter((t) => (t.revealed & (1 << player.id)) !== 0).length).toBeGreaterThan(10);
    }
    }
  });

  it('keeps starts far enough apart to be fair', () => {
    const state = fresh(11, 20);
    const subs: { x: number; y: number }[] = [];
    for (let id = 0; id < 4; id++) subs.push(startTiles(state, id).sub);
    for (let i = 0; i < subs.length; i++) {
      for (let j = i + 1; j < subs.length; j++) {
        const d = Math.abs(subs[i].x - subs[j].x) + Math.abs(subs[i].y - subs[j].y);
        expect(d).toBeGreaterThan(6);
      }
    }
  });
});

describe('territory and construction', () => {
  it('claims must border your territory and get more expensive', () => {
    const state = fresh(21);
    const player = emptyPlayer(state, 0);
    const owned = state.tiles.filter((t) => t.owner === 0);
    const firstTarget = state.tiles.find(
      (t) => t.owner === null && owned.some((o) => Math.abs(o.x - t.x) + Math.abs(o.y - t.y) === 1) && t.terrain !== 'ocean',
    )!;
    expect(firstTarget).toBeTruthy();
    const before = player.credits;
    const cost = claimCost(player);
    const result = applyAction(state, 0, { type: 'claim', x: firstTarget.x, y: firstTarget.y });
    expect(result.ok).toBe(true);
    expect(firstTarget.owner).toBe(0);
    expect(player.credits).toBeCloseTo(before - cost, 5);
    const secondCost = claimCost(player);
    expect(secondCost).toBeGreaterThan(cost);
    const isolated = state.tiles.find((t) => t.owner === null && !owned.some((o) => Math.abs(o.x - t.x) + Math.abs(o.y - t.y) === 1));
    if (isolated) expect(canClaim(state, player, isolated).ok).toBe(false);
  });

  it('rejects construction on water, on rival land, and without the tech', () => {
    const state = fresh(22);
    const player = emptyPlayer(state, 0);
    const water = state.tiles.find((t) => t.terrain === 'ocean')!;
    expect(canBuild(player, water, 'solar').ok).toBe(false);
    const rivalTile = state.tiles.find((t) => t.owner === 1)!;
    expect(canBuild(player, rivalTile, 'solar').ok).toBe(false);
    const empty = state.tiles.find((t) => t.owner === 0 && !t.structure)!;
    if (empty) {
      expect(canBuild(player, empty, 'hyperscale').reason).toContain('Advanced Cooling');
      expect(canBuild(player, empty, 'nuclear').reason).toContain('Advanced Nuclear');
    }
  });

  it('deducts the exact quoted cost and applies terrain multipliers', () => {
    const state = fresh(23);
    const player = emptyPlayer(state, 0);
    player.techs.push('hydropower');
    player.credits = 20000;
    const river = state.tiles.find((t) => t.terrain === 'river' && !t.structure);
    if (river) {
      river.owner = 0;
      river.structure = null;
      const quote = canBuild(player, river, 'hydro');
      const before = player.credits;
      const res = applyAction(state, 0, { type: 'build', x: river.x, y: river.y, kind: 'hydro' });
      expect(res.ok).toBe(true);
      expect(player.credits).toBeCloseTo(before - quote.cost, 5);
      expect(tileAt(state, river.x, river.y)?.structure?.kind).toBe('hydro');
    }
    const forest = state.tiles.find((t) => t.terrain === 'forest' && !t.structure);
    if (forest) {
      forest.owner = 0;
      const forestQuote = canBuild(player, forest, 'solar');
      const plains = state.tiles.find((t) => t.terrain === 'plains' && t.owner === 0 && !t.structure);
      if (plains) expect(forestQuote.cost).toBeGreaterThan(canBuild(player, plains, 'solar').cost);
    }
  });
});

describe('power dispatch', () => {
  it('data centers draw IT power scaled by PUE and weather', () => {
    const state = fresh(31);
    const report = previewPlayer(state, 0).report;
    const { dc } = startTiles(state);
    const def = STRUCTURES.edge;
    const expectedPue = def.pue! * TERRAINS[dc.terrain].cooling * state.weather.cooling;
    const expected = def.mw * expectedPue;
    expect(report.load).toBeGreaterThan(expected * 0.85);
    expect(report.load).toBeLessThan(expected * 1.15);
  });

  it('serves load from generation before buying imports', () => {
    const state = fresh(32);
    // Plenty of cheap generation on the starting island.
    for (const tile of state.tiles.filter((t) => t.owner === 0 && !t.structure).slice(0, 2)) {
      tile.structure = { kind: 'solar', owner: 0, builtTurn: 0 };
    }
    state.weather = weatherById('sunny');
    const report = dispatchPlayer(state, 0, { powerPrice: 5, computePrice: 24, fuelMult: 1 }).report;
    expect(report.imported).toBeLessThan(2);
    expect(report.served).toBeCloseTo(Math.min(report.load, report.generation), 0);
  });

  it('transmission corridors merge islands and unlock stranded generation', () => {
    const state = fresh(33);
    state.links = [];
    // Wipe the starter grid and build a controlled two-island system.
    for (const tile of state.tiles) {
      if (tile.owner === 0) tile.owner = null;
      if (tile.structure?.owner === 0) tile.structure = null;
    }
    const player = emptyPlayer(state, 0);
    player.credits = 10000;
    place(state, 3, 3, 'substation', 0);
    place(state, 9, 3, 'substation', 0);
    place(state, 4, 3, 'solar', 0);
    place(state, 10, 3, 'edge', 0);
    state.weather = weatherById('clear');
    const before = dispatchPlayer(state, 0, { powerPrice: 5, computePrice: 24, fuelMult: 1 }).report;
    expect(islandsOf(state, 0).length).toBe(2);
    expect(before.islands.length).toBe(2);
    const linkCheck = canLink(state, player, { x: 3, y: 3 }, { x: 9, y: 3 });
    expect(linkCheck.ok).toBe(true);
    const res = applyAction(state, 0, { type: 'link', ax: 3, ay: 3, bx: 9, by: 3 });
    expect(res.ok).toBe(true);
    const after = dispatchPlayer(state, 0, { powerPrice: 5, computePrice: 24, fuelMult: 1 }).report;
    expect(islandsOf(state, 0).length).toBe(1);
    expect(after.imported).toBeLessThan(before.imported);
    expect(after.stability).toBeGreaterThanOrEqual(before.stability - 1);
  });

  it('corridor capacity is enforced and reported as congestion', () => {
    const state = fresh(34);
    state.links = [];
    for (const tile of state.tiles) {
      if (tile.owner === 0) tile.owner = null;
      if (tile.structure?.owner === 0) tile.structure = null;
    }
    const player = emptyPlayer(state, 0);
    player.credits = 50000;
    place(state, 3, 3, 'substation', 0);
    place(state, 5, 3, 'substation', 0);
    place(state, 4, 3, 'gas', 0);
    for (let i = 0; i < 12; i++) place(state, 6 + (i % 2), 3 + Math.floor(i / 2), 'edge', 0);
    state.links.push({ owner: 0, a: { x: 3, y: 3 }, b: { x: 5, y: 3 } });
    const report = dispatchPlayer(state, 0, { powerPrice: 5, computePrice: 24, fuelMult: 1 }).report;
    // 12 edge centers need ~240 MW; 38 MW of gas + 140 MW of import rights cannot cover it.
    expect(report.load).toBeGreaterThan(200);
    expect(report.generation).toBeLessThanOrEqual(STRUCTURES.gas.mw + 0.01);
    expect(report.imported).toBeGreaterThan(0);
    expect(report.served).toBeLessThan(report.load);
  });

  it('off-grid assets produce nothing', () => {
    const state = fresh(35);
    const player = emptyPlayer(state, 0);
    const before = previewPlayer(state, 0).report.generation;
    const far = state.tiles.find((t) => t.owner === null && t.terrain === 'plains' && !t.structure);
    if (!far) return;
    far.owner = 0;
    far.structure = { kind: 'solar', owner: 0, builtTurn: 0 };
    const report = previewPlayer(state, 0).report;
    expect(report.generation).toBeCloseTo(before, 5);
    expect(expectedGeneration(state, player)).toBeGreaterThan(before);
  });

  it('batteries respect their charge, rating and round-trip efficiency', () => {
    const state = fresh(36);
    state.links = [];
    for (const tile of state.tiles) {
      if (tile.owner === 0) tile.owner = null;
      if (tile.structure?.owner === 0) tile.structure = null;
    }
    const player = emptyPlayer(state, 0);
    player.techs.push('batteries');
    player.credits = 20000;
    place(state, 3, 3, 'substation', 0);
    place(state, 4, 3, 'battery', 0);
    place(state, 6, 3, 'edge', 0);
    place(state, 5, 3, 'solar', 0);
    place(state, 4, 4, 'solar', 0);
    const battery = tileAt(state, 4, 3)!.structure!;
    battery.charge = 30;
    state.weather = weatherById('sunny');
    const report = dispatchPlayer(state, 0, { powerPrice: 5, computePrice: 24, fuelMult: 1 }).report;
    expect(report.discharged).toBeLessThanOrEqual(STRUCTURES.battery.rate! + 0.001);
    expect(battery.charge).toBeGreaterThanOrEqual(0);
    expect(battery.charge).toBeLessThanOrEqual(STRUCTURES.battery.storage! + 0.001);
    expect(report.charged).toBeGreaterThanOrEqual(0);
    // Charging needs surplus; with two solar farms and a single DC it should have charged.
    expect(report.charged + report.exported + report.curtailed).toBeGreaterThan(0);
  });
});

describe('research', () => {
  it('enforces prerequisites and spends research points', () => {
    const state = fresh(41);
    const player = emptyPlayer(state, 0);
    player.research = 10000;
    expect(canResearch(player, 'advancedCooling').ok).toBe(false);
    expect(canResearch(player, 'efficientGpus').ok).toBe(true);
    const cost = techCost({ id: 'efficientGpus', name: '', branch: 'compute', tier: 1, cost: 105, requires: [], blurb: '', effect: '' }, player);
    const before = player.research;
    expect(applyAction(state, 0, { type: 'research', tech: 'efficientGpus' }).ok).toBe(true);
    expect(player.techs).toContain('efficientGpus');
    expect(player.research).toBeCloseTo(before - cost, 4);
    expect(canResearch(player, 'advancedCooling').ok).toBe(true);
  });

  it('tech unlocks are enforced by construction', () => {
    const state = fresh(42);
    const player = emptyPlayer(state, 0);
    const tile = state.tiles.find((t) => t.owner === 0 && !t.structure && t.terrain === 'plains');
    if (!tile) return;
    player.techs.push('efficientGpus', 'advancedCooling');
    expect(canBuild(player, tile, 'hyperscale').ok).toBe(false);
    player.credits = 100000;
    expect(canBuild(player, tile, 'hyperscale').ok).toBe(true);
  });
});

describe('markets and events', () => {
  it('prices fall as compute supply rises', () => {
    const cheap = computePriceFor(200, 50, 24, 1);
    const fair = computePriceFor(200, 200, 24, 1);
    const glut = computePriceFor(200, 600, 24, 1);
    expect(cheap).toBeGreaterThan(fair);
    expect(fair).toBeGreaterThan(glut);
    expect(glut).toBeGreaterThan(0);
  });

  it('weather moves power prices and generation', () => {
    const storm = powerPriceFor(5, weatherById('storm'), [], 1);
    const calm = powerPriceFor(5, weatherById('clear'), [], 1);
    expect(storm).toBeGreaterThan(calm);
    const state = fresh(43);
    const player = emptyPlayer(state, 0);
    const { solar } = startTiles(state);
    state.weather = weatherById('clear');
    const clear = structureOutput(state, player, solar);
    state.weather = weatherById('storm');
    const rain = structureOutput(state, player, solar);
    expect(clear).toBeGreaterThan(rain);
    expect(structureOutput(state, player, startTiles(state).solar)).toBeGreaterThanOrEqual(0);
    expect(WEATHERS.length).toBeGreaterThanOrEqual(8);
  });
});

describe('victory and defeat', () => {
  it('compute dominance needs three consecutive turns above the share threshold', () => {
    const state = fresh(51);
    const reports = state.players.map((p) => ({
      ...state.report[p.id],
      compute: p.id === 0 ? 100 : 10,
    }));
    const it = [50, 10, 10, 10];
    for (let i = 0; i < 3; i++) evaluateVictory(state, reports, it);
    expect(state.victory.over).toBe(true);
    expect(state.victory.winner).toBe(0);
    expect(state.victory.kind).toBe('compute');
  });

  it('score victory decides the game at the horizon', () => {
    const result = runHeadlessMatch({ seed: 61, size: 14, maxTurns: 12, allAi: true });
    expect(result.over).toBe(true);
    expect(result.turns).toBeGreaterThan(0);
    expect(result.kind).not.toBeNull();
  });

  it('deep insolvency ends a human game', () => {
    const state = fresh(52, 14, 5);
    state.players[0].credits = -50000;
    state.players[0].deficitStreak = 2;
    state.players[1].isAI = false;
    state.players[2].isAI = false;
    state.players[3].isAI = false;
    resolveTurn(state);
    expect(state.victory.over).toBe(true);
    expect(state.victory.kind).toBe('insolvency');
  });
});

describe('victory paths', () => {
  it('awards the energy empire when firm capacity, stability and cash hold', () => {
    const state = fresh(53);
    const { sub } = startTiles(state);
    // A firm gas fleet inside the substation radius.
    let built = 0;
    for (let dy = -3; dy <= 3 && built < 17; dy++) {
      for (let dx = -3; dx <= 3 && built < 17; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3) continue;
        const x = sub.x + dx;
        const y = sub.y + dy;
        const tile = tileAt(state, x, y);
        if (!tile || tile.structure) continue;
        place(state, x, y, 'gas', 0);
        built++;
      }
    }
    expect(firmCapacity(state, state.players[0])).toBeGreaterThanOrEqual(600);
    state.players[0].credits = 12000;
    const reports = state.players.map((p) => makeReport(p.id, { compute: 20, stability: 90 }));
    for (let i = 0; i < 3; i++) evaluateVictory(state, reports, reports.map(() => 10));
    expect(state.victory.over).toBe(true);
    expect(state.victory.kind).toBe('energy');
  });

  it('awards technology leadership to an efficient autonomous fleet', () => {
    const state = fresh(54);
    state.players[0].techs.push('autonomousFleet');
    const reports = state.players.map((p) => makeReport(p.id, { compute: p.id === 0 ? 300 : 20, stability: 90 }));
    for (let i = 0; i < 2; i++) evaluateVictory(state, reports, reports.map((_, index) => (index === 0 ? 200 : 40)));
    expect(state.victory.over).toBe(true);
    expect(state.victory.kind).toBe('tech');
    expect(state.victory.winner).toBe(0);
  });
});

describe('persistence and determinism', () => {
  it('round-trips saves, including AI state and storage', () => {
    const state = fresh(71, 14);
    state.players[0].techs.push('batteries');
    const restored = parseSave(serialize(state));
    expect(restored).not.toBeNull();
    expect(serialize(restored!)).toBe(serialize(state));
    expect(parseSave('{"version":1}')).toBeNull();
    expect(parseSave('not json')).toBeNull();
    const encoded = exportSave(state);
    expect(importSave(encoded)).not.toBeNull();
  });

  it('resolves identical turns for identical states', () => {
    const a = fresh(81, 16);
    const b = fresh(81, 16);
    for (const p of a.players) p.isAI = true;
    for (const p of b.players) p.isAI = true;
    for (let i = 0; i < 8; i++) {
      endTurn(a);
      endTurn(b);
    }
    expect(serialize(a)).toBe(serialize(b));
  });
});

describe('rival companies', () => {
  it('play legal matches and never stall', () => {
    for (const seed of [91, 92, 93]) {
      const state = createGame({ seed, size: 16, maxTurns: 30, playerName: 'X', credits: BALANCE.startCredits });
      for (const p of state.players) p.isAI = true;
      while (!state.victory.over && state.turn <= state.maxTurns) endTurn(state);
      expect(aiSanityCheck(state)).toEqual([]);
      for (const p of state.players) {
        if (p.bankrupt) continue;
        const assets = playerStructures(state, p.id);
        expect(assets.length).toBeGreaterThan(2);
        for (const { tile, structure } of assets) {
          expect(structure.owner).toBe(p.id);
          expect(tile.owner).toBe(p.id);
        }
      }
      const totalStructures = state.tiles.filter((t) => t.structure && t.structure.owner >= 0).length;
      expect(totalStructures).toBeGreaterThan(20);
    }
  });

  it('finishes full-length AI matches without crashes', () => {
    for (const seed of [94, 95, 96]) {
      const result = runHeadlessMatch({ seed, size: 18, maxTurns: 40, allAi: true });
      expect(result.problems).toEqual([]);
      expect(result.over).toBe(true);
    }
  });
});


function makeReport(playerId: number, options: { compute: number; stability: number }): PlayerTurnReport {
  return {
    playerId,
    generation: 100,
    load: 50,
    served: 50,
    imported: 0,
    exported: 0,
    charged: 0,
    discharged: 0,
    curtailed: 0,
    compute: options.compute,
    itMW: Math.max(1, options.compute / 1.4),
    computeRevenue: 0,
    powerRevenue: 0,
    powerCost: 0,
    fuelCost: 0,
    maintenance: 0,
    net: 0,
    research: 0,
    stability: options.stability,
    dcUtil: {},
    linkFlow: {},
    islands: [
      {
        islandId: 0,
        substations: [],
        generation: 100,
        load: 50,
        served: 50,
        imported: 0,
        exported: 0,
        charged: 0,
        discharged: 0,
        capacity: 100,
        reserve: 0.4,
        stability: options.stability,
        congested: 0,
        curtailed: 0,
      },
    ],
  };
}
