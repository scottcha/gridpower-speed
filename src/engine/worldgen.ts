/** Seeded procedural world generation: terrain regions, rivers, assets and fair starts. */
import { BALANCE, PERSONAS, PLAYER_COLORS, STRUCTURES, TERRAINS, WEATHERS } from './config';
import { fbm, hash2, makeRng, newRngState, valueNoise } from './rng';
import { computePriceFor, rollForecast, weatherById } from './markets';
import { manhattan, neighbors4, reveal, tileAt } from './board';
import type { Board } from './board';
import type { EventMod, GameSetup, GameState, Player, Terrain, Tile } from './types';

interface Fields {
  elevation: Float32Array;
  moisture: Float32Array;
  richness: Float32Array;
}

function generateFields(size: number, seed: number): Fields {
  const elevation = new Float32Array(size * size);
  const moisture = new Float32Array(size * size);
  const richness = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const base = valueNoise(x * 0.115, y * 0.115, seed ^ 0x51a3) * 0.55 + valueNoise(x * 0.057, y * 0.057, seed ^ 0x77f1) * 0.45;
      const ridge = 1 - Math.abs(valueNoise(x * 0.09, y * 0.09, seed ^ 0x19d7) * 2 - 1);
      elevation[i] = base * 0.72 + ridge * 0.28;
      moisture[i] = valueNoise(x * 0.1, y * 0.1, seed ^ 0x2c07) * 0.6 + valueNoise(x * 0.045, y * 0.045, seed ^ 0x4b91) * 0.4;
      richness[i] = valueNoise(x * 0.085, y * 0.085, seed ^ 0x6ae3) * 0.7 + valueNoise(x * 0.2, y * 0.2, seed ^ 0x0d13) * 0.3;
    }
  }
  return { elevation, moisture, richness };
}

function buildTerrain(size: number, seed: number, fields: Fields): Tile[] {
  const board: Board = { size, tiles: [] };
  const { elevation, moisture, richness } = fields;
  const tiles = board.tiles;
  const n = size * size;

  // A single low-frequency continent field keeps landmasses coherent instead of
  // speckling the map with islands. The threshold is chosen to hit a land target
  // while leaving the outer ring as open water.
  const continent = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      continent[y * size + x] = fbm(x * 0.055, y * 0.055, seed ^ 0xa1f, 3) * 0.65 + valueNoise(x * 0.14, y * 0.14, seed ^ 0x3c1) * 0.35;
    }
  }
  const interior: number[] = [];
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) interior.push(continent[y * size + x]);
  interior.sort((a, b) => a - b);
  const edgeTiles = n - interior.length;
  const targetOcean = Math.round(n * 0.3);
  const interiorOcean = Math.max(0, Math.min(interior.length, targetOcean - edgeTiles));
  const threshold = interior[Math.max(0, Math.min(interior.length - 1, interiorOcean))] ?? 0.4;

  const isOcean = new Uint8Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      isOcean[i] = edge === 0 || continent[i] < threshold ? 1 : 0;
    }
  }

  // Smooth the coastline: remove one-tile islands and fill one-tile lakes.
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? 1 : isOcean[y * size + x]);
  for (let pass = 0; pass < 3; pass++) {
    const next = Uint8Array.from(isOcean);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = y * size + x;
        const sea = at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1);
        if (isOcean[i] === 1 && sea <= 1) next[i] = 0;
        if (isOcean[i] === 0 && sea >= 3) next[i] = 1;
      }
    }
    isOcean.set(next);
  }

  // Classify by quantiles rather than raw thresholds so every world has a
  // readable mix of biomes (roughly 20% desert, 32% forest, 12% mountains).
  const landMoisture: number[] = [];
  const landElevation: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isOcean[i]) continue;
    landMoisture.push(moisture[i]);
    landElevation.push(elevation[i]);
  }
  landMoisture.sort((a, b) => a - b);
  landElevation.sort((a, b) => a - b);
  const quantile = (values: number[], q: number) => values[Math.min(values.length - 1, Math.max(0, Math.floor(values.length * q)))] ?? 0.5;
  const desertCut = quantile(landMoisture, 0.2);
  const forestCut = quantile(landMoisture, 0.66);
  const hillCut = quantile(landElevation, 0.7);
  const mountainCut = quantile(landElevation, 0.88);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let terrain: Terrain;
      let elev = 0;
      if (isOcean[i]) {
        terrain = 'ocean';
      } else if (elevation[i] >= mountainCut) {
        terrain = 'mountain';
        elev = 2;
      } else if (moisture[i] <= desertCut) {
        terrain = 'desert';
        elev = elevation[i] >= hillCut ? 1 : 0;
      } else if (moisture[i] >= forestCut) {
        terrain = 'forest';
        elev = elevation[i] >= hillCut ? 1 : 0;
      } else {
        terrain = 'plains';
        elev = elevation[i] >= hillCut ? 1 : 0;
      }
      tiles.push({
        x,
        y,
        terrain,
        elevation: elev,
        variant: hash2(x, y, seed),
        owner: null,
        structure: null,
        revealed: 0,
      });
    }
  }

  // Coastline identity: land touching the sea gets cooling and offshore-wind bonuses.
  for (const tile of tiles) {
    if (tile.terrain === 'ocean') continue;
    if (!neighbors4(board, tile.x, tile.y).some((n) => n.terrain === 'ocean')) continue;
    if (tile.terrain === 'plains' || tile.terrain === 'desert' || tile.terrain === 'forest') {
      tile.terrain = 'coast';
      tile.elevation = 0;
    }
  }

  // Rivers walk downhill from the ridges toward the sea.
  const sources = tiles
    .filter((t) => t.terrain === 'mountain' && hash2(t.x, t.y, seed ^ 0xabc) > 0.4)
    .sort((a, b) => elevation[b.y * size + b.x] - elevation[a.y * size + a.x]);
  let riverCount = 0;
  for (const source of sources) {
    if (riverCount >= 3) break;
    const path: Tile[] = [];
    let cur = source;
    for (let step = 0; step < 24; step++) {
      const landNbrs = neighbors4(board, cur.x, cur.y).filter((n) => n.terrain !== 'ocean' && n.terrain !== 'river');
      if (!landNbrs.length) break;
      let next = landNbrs[0];
      let lowest = Infinity;
      for (const n of landNbrs) {
        const e = elevation[n.y * size + n.x] + hash2(n.x, n.y, seed ^ 0x5f) * 0.05;
        if (e < lowest) {
          lowest = e;
          next = n;
        }
      }
      path.push(next);
      cur = next;
      if (neighbors4(board, next.x, next.y).some((n) => n.terrain === 'ocean')) break;
    }
    if (path.length < 3) continue;
    for (const t of path) {
      if (t.terrain === 'plains' || t.terrain === 'forest' || t.terrain === 'desert' || t.terrain === 'coast') {
        t.terrain = 'river';
        t.elevation = 0;
      }
    }
    riverCount++;
  }

  // Geothermal fields sit at the foot of volcanic ridges.
  let geoCount = 0;
  for (const tile of tiles) {
    if (geoCount >= 8) break;
    if (tile.terrain !== 'plains' && tile.terrain !== 'desert' && tile.terrain !== 'forest') continue;
    const atFoot = neighbors4(board, tile.x, tile.y).some((n) => n.terrain === 'mountain');
    if (atFoot && hash2(tile.x, tile.y, seed ^ 0x77) > 0.55) {
      tile.terrain = 'geothermal';
      geoCount++;
    }
  }

  // Gas basins: sedimentary lowlands.
  let basinCount = 0;
  for (const tile of tiles) {
    if (basinCount >= 9) break;
    if (tile.terrain !== 'plains' && tile.terrain !== 'desert') continue;
    const i = tile.y * size + tile.x;
    if (elevation[i] < 0.5 && richness[i] > 0.46 && hash2(tile.x, tile.y, seed ^ 0x991) > 0.42) {
      tile.terrain = 'basin';
      basinCount++;
    }
  }

  // Metro clusters on flat ground.
  const urbanCenters: Tile[] = [];
  const flat = tiles.filter((t) => (t.terrain === 'plains' || t.terrain === 'coast') && t.elevation === 0);
  flat.sort((a, b) => hash2(a.x, a.y, seed ^ 0x1d3) - hash2(b.x, b.y, seed ^ 0x1d3));
  for (const tile of flat) {
    if (urbanCenters.length >= 5) break;
    if (urbanCenters.some((c) => manhattan(c, tile) < Math.max(4, size * 0.22))) continue;
    urbanCenters.push(tile);
    tile.terrain = 'urban';
    for (const n of neighbors4(board, tile.x, tile.y)) {
      if ((n.terrain === 'plains' || n.terrain === 'coast') && hash2(n.x, n.y, seed ^ 0x2f9) > 0.4) n.terrain = 'urban';
    }
  }

  return tiles;
}

/** Size of the connected landmass a tile belongs to (capped for speed). */
function landmassSize(board: Board, start: Tile): number {
  const seen = new Set<string>();
  const queue: Tile[] = [start];
  let count = 0;
  while (queue.length && count < 220) {
    const tile = queue.pop()!;
    const key = `${tile.x},${tile.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (tile.terrain === 'ocean') continue;
    count++;
    for (const n of neighbors4(board, tile.x, tile.y)) {
      if (n.terrain !== 'ocean') queue.push(n);
    }
  }
  return count;
}

/** Score a candidate start: nearby resources, buildable land, and a little seeded jitter. */
function scoreStart(board: Board, tile: Tile): number {
  let score = hash2(tile.x, tile.y, 7) * 1.5;
  let land = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const t = tileAt(board, tile.x + dx, tile.y + dy);
      if (!t) continue;
      if (TERRAINS[t.terrain].land) land++;
      if (t.terrain === 'geothermal') score += 7;
      else if (t.terrain === 'river') score += 5;
      else if (t.terrain === 'basin') score += 4;
      else if (t.terrain === 'urban') score += 3;
      else if (t.terrain === 'coast') score += 2;
      else if (t.terrain === 'mountain') score += 1.2;
      else if (t.terrain === 'plains') score += 2.6;
      else if (t.terrain === 'forest') score += 1.6;
      else if (t.terrain === 'desert') score -= 1.2;
    }
  }
  if (land < 18) return -100;
  const mass = landmassSize(board, tile);
  if (mass < 45) return -100;
  score += Math.min(18, mass / 8);
  return score;
}

function chooseStarts(tiles: Tile[], size: number): Tile[] {
  const board: Board = { size, tiles };
  const candidates = tiles
    .filter((t) => (t.terrain === 'plains' || t.terrain === 'coast') && t.elevation === 0)
    .map((t) => ({ tile: t, score: scoreStart(board, t) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  const chosen: Tile[] = [];
  // Farthest-point sampling with a quality tiebreak: good land, far from rivals.
  for (const minimum of [Math.max(6, Math.floor(size * 0.4)), Math.max(5, Math.floor(size * 0.3)), 4]) {
    while (chosen.length < 4) {
      let best: { tile: Tile; value: number } | null = null;
      for (const candidate of candidates) {
        if (chosen.includes(candidate.tile)) continue;
        const distance = chosen.length ? Math.min(...chosen.map((c) => manhattan(c, candidate.tile))) : Number.POSITIVE_INFINITY;
        if (chosen.length && distance < minimum) continue;
        const value = candidate.score + (chosen.length ? distance * 26 : 0);
        if (!best || value > best.value) best = { tile: candidate.tile, value };
      }
      if (!best) break;
      chosen.push(best.tile);
    }
    if (chosen.length >= 4) break;
  }
  for (const tile of tiles) {
    if (chosen.length >= 4) break;
    if (tile.terrain === 'ocean' || tile.structure || chosen.includes(tile)) continue;
    if (chosen.some((c) => manhattan(c, tile) < 3)) continue;
    chosen.push(tile);
  }
  return chosen;
}

function placeStart(state: GameState, playerId: number, start: Tile): void {
  start.terrain = 'plains';
  const owned = [start, ...neighbors4(state, start.x, start.y).filter((t) => t.terrain !== 'ocean')].filter(
    (t) => (t.owner === null || t.owner === playerId) && (!t.structure || t.structure.owner === playerId),
  );
  for (const t of owned) t.owner = playerId;
  start.structure = { kind: 'substation', owner: playerId, builtTurn: 0 };
  const open = owned
    .filter((t) => t !== start && !t.structure)
    .sort((a, b) => hash2(a.x, a.y, playerId) - hash2(b.x, b.y, playerId));
  // A start must always be able to host both a solar farm and an edge site.
  const spare = state.tiles
    .filter(
      (t) =>
        t !== start &&
        !t.structure &&
        TERRAINS[t.terrain].land &&
        (t.owner === null || t.owner === playerId) &&
        Math.abs(t.x - start.x) + Math.abs(t.y - start.y) <= 2 &&
        !open.includes(t),
    )
    .sort(
      (a, b) =>
        Math.abs(a.x - start.x) + Math.abs(a.y - start.y) - (Math.abs(b.x - start.x) + Math.abs(b.y - start.y)) ||
        hash2(a.x, a.y, playerId) - hash2(b.x, b.y, playerId),
    );
  while (open.length < 2 && spare.length) {
    const tile = spare.shift();
    if (!tile) break;
    tile.owner = playerId;
    open.push(tile);
  }
  const solarTile = open.find((t) => STRUCTURES.solar.terrains.includes(t.terrain)) ?? open[0] ?? start;
  if (solarTile !== start) {
    if (!STRUCTURES.solar.terrains.includes(solarTile.terrain)) solarTile.terrain = 'plains';
    solarTile.structure = { kind: 'solar', owner: playerId, builtTurn: 0 };
  }
  const dcTile = open.find((t) => t !== solarTile && STRUCTURES.edge.terrains.includes(t.terrain)) ?? open.find((t) => t !== solarTile) ?? start;
  if (dcTile !== start) {
    if (!STRUCTURES.edge.terrains.includes(dcTile.terrain)) dcTile.terrain = 'plains';
    dcTile.structure = { kind: 'edge', owner: playerId, builtTurn: 0, policy: 'compute' };
  }
  reveal(state, playerId, start.x, start.y, 4);
}

function addNeutralAssets(state: GameState, starts: Tile[]): void {
  const candidates = state.tiles.filter(
    (t) =>
      !t.structure &&
      t.owner === null &&
      (t.terrain === 'plains' || t.terrain === 'coast' || t.terrain === 'desert' || t.terrain === 'urban' || t.terrain === 'basin') &&
      starts.every((s) => manhattan(s, t) >= 5),
  );
  candidates.sort((a, b) => hash2(a.x, a.y, state.seed ^ 0x9e) - hash2(b.x, b.y, state.seed ^ 0x9e));
  const placed: Tile[] = [];
  for (const tile of candidates) {
    if (placed.length >= 4) break;
    if (placed.some((p) => manhattan(p, tile) < 5)) continue;
    placed.push(tile);
    tile.structure = { kind: 'substation', owner: -1, builtTurn: 0 };
  }
}

function emptyReport(playerId: number): GameState['report'][number] {
  return {
    playerId,
    generation: 0,
    load: 0,
    served: 0,
    imported: 0,
    exported: 0,
    charged: 0,
    discharged: 0,
    curtailed: 0,
    compute: 0,
    itMW: 0,
    computeRevenue: 0,
    powerRevenue: 0,
    powerCost: 0,
    fuelCost: 0,
    maintenance: 0,
    net: 0,
    research: 0,
    stability: 70,
    islands: [],
    dcUtil: {},
    linkFlow: {},
  };
}

export function createGame(setup: GameSetup): GameState {
  const seed = setup.seed >>> 0;
  const size = setup.size;
  const tiles = buildTerrain(size, seed, generateFields(size, seed));
  const starts = chooseStarts(tiles, size);

  const rngHolder = { rng: newRngState(seed) };
  const weather = makeRng(rngHolder).weighted(WEATHERS);
  const forecast = rollForecast(rngHolder);

  const humanColor = PLAYER_COLORS[0];
  const players: Player[] = [
    {
      id: 0,
      name: setup.playerName || 'Lumen Grid',
      corp: setup.playerName || 'Lumen Grid',
      color: humanColor.color,
      accent: humanColor.accent,
      isAI: false,
      persona: null,
      credits: setup.credits,
      research: BALANCE.startResearch,
      techs: [],
      claims: 0,
      policy: 'compute',
      stats: { totalCompute: 0, totalRevenue: 0, peakCompute: 0, peakCredits: setup.credits, built: 3, claims: 0, techs: 0 },
      aiMemory: { lastShortfall: 0, lastStability: 70, focus: null, aggression: 0.5 },
      deficitStreak: 0,
      bankrupt: false,
    },
  ];
  const personaIds = ['helios', 'titan', 'volt'] as const;
  personaIds.forEach((pid, i) => {
    const persona = PERSONAS[pid];
    players.push({
      id: i + 1,
      name: persona.name,
      corp: persona.corp,
      color: persona.color,
      accent: persona.accent,
      isAI: true,
      persona: pid,
      credits: setup.credits,
      research: BALANCE.startResearch,
      techs: [],
      claims: 0,
      policy: persona.policy,
      stats: { totalCompute: 0, totalRevenue: 0, peakCompute: 0, peakCredits: setup.credits, built: 3, claims: 0, techs: 0 },
      aiMemory: { lastShortfall: 0, lastStability: 70, focus: null, aggression: 0.52 + i * 0.04 },
      deficitStreak: 0,
      bankrupt: false,
    });
  });

  const state: GameState = {
    version: 1,
    seed,
    rng: rngHolder.rng,
    turn: 1,
    maxTurns: setup.maxTurns,
    size,
    tiles,
    players,
    links: [],
    weather: weatherById(weather.id),
    market: {
      powerPrice: BALANCE.powerBase * weather.powerPrice,
      computePrice: computePriceFor(BALANCE.demandBase, 0, BALANCE.computeBase, 1),
      demand: BALANCE.demandBase,
      supply: 0,
      forecast,
      events: [] as EventMod[],
    },
    report: players.map((p) => emptyReport(p.id)),
    history: [],
    log: [],
    victory: {
      over: false,
      winner: null,
      kind: null,
      progress: players.map(() => ({
        computeShare: 0,
        computeStreak: 0,
        firmMw: 0,
        minStability: 100,
        energyStreak: 0,
        efficientCompute: 0,
        techComplete: false,
        techStreak: 0,
        score: 0,
      })),
    },
    summary: null,
    lastSummaryTurn: 0,
    revision: 1,
  };

  starts.forEach((start, i) => placeStart(state, i, start));
  addNeutralAssets(state, starts);

  for (const p of players) {
    state.log.push({
      turn: 1,
      playerId: p.id,
      kind: 'claim',
      text: p.isAI ? `${p.corp} secures a foothold on the grid.` : `${p.corp} is founded. Your first data center is live.`,
    });
  }
  state.log.push({ turn: 1, playerId: null, kind: 'weather', text: `${state.weather.name}: ${state.weather.blurb}` });
  return state;
}
