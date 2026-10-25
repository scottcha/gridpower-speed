/**
 * Electrical network simulation.
 *
 * Each grid island is solved as a min-cost max-flow problem: generators feed
 * substations, substations exchange power over capacity-limited corridors, and
 * data centers draw from their local substation. Costs encode fuel, imports and
 * the priority of serving compute load. This captures real transmission
 * bottlenecks without pretending to be an AC solver.
 */
import { BALANCE, POLICIES, STRUCTURES, TERRAINS } from './config';
import { attachedSubstation, playerSubstations, playerStructures } from './board';
import { isComputeKind, isGeneratorKind, lineCapacity, substationThroughput, techMods } from './progression';
import { flexEventMultiplier, researchMultiplier, stabilityEventPenalty } from './markets';
import type { GameState, GridReport, Player, PlayerTurnReport, Pos, StructureKind, Tile } from './types';

export interface DispatchContext {
  powerPrice: number;
  computePrice: number;
  fuelMult: number;
}

export interface DispatchResult {
  report: PlayerTurnReport;
  compute: number;
  itDelivered: number;
  flexIncome: number;
}

export function policyUtilization(policy: keyof typeof POLICIES, computePrice: number, powerPrice: number): number {
  if (policy === 'compute') return 1;
  if (policy === 'energy') return 0.78;
  if (policy === 'flex') return 0.86;
  if (policy === 'reliability') return 0.94;
  const ratio = computePrice / Math.max(0.01, powerPrice * 3.2);
  return Math.min(1, Math.max(0.7, 0.72 + (ratio - 0.6) * 0.55));
}

export function effectivePue(state: GameState, player: Player, tile: Tile, kind: StructureKind): number {
  const def = STRUCTURES[kind];
  if (!def.pue) return 1;
  return def.pue * TERRAINS[tile.terrain].cooling * state.weather.cooling * techMods(player).pue;
}

export function structureOutput(state: GameState, player: Player, tile: Tile): number {
  const st = tile.structure;
  if (!st || !isGeneratorKind(st.kind)) return 0;
  const def = STRUCTURES[st.kind];
  const mods = techMods(player);
  const terrain = TERRAINS[tile.terrain];
  let out = def.mw * mods.gen;
  if (st.kind === 'solar') out *= terrain.solar * state.weather.solar * mods.solar;
  else if (st.kind === 'wind') out *= terrain.wind * state.weather.wind * mods.wind;
  else if (st.kind === 'gas') out *= tile.terrain === 'basin' ? 1.15 : 1;
  else if (st.kind === 'hydro') out *= state.weather.hydro;
  return Math.max(0, out);
}

/** Capacity available in average weather; used for planning rather than dispatch. */
export function expectedGeneration(state: GameState, player: Player): number {
  const mods = techMods(player);
  let total = 0;
  for (const { tile } of playerStructures(state, player.id)) {
    const kind = tile.structure?.kind;
    if (!kind || !isGeneratorKind(kind) || !isOnline(state, tile)) continue;
    const def = STRUCTURES[kind];
    const terrain = TERRAINS[tile.terrain];
    let out = def.mw * mods.gen;
    if (kind === 'solar') out *= terrain.solar * mods.solar;
    else if (kind === 'wind') out *= terrain.wind * mods.wind;
    else if (kind === 'gas') out *= tile.terrain === 'basin' ? 1.15 : 1;
    total += out;
  }
  return total;
}

export function isOnline(state: GameState, tile: Tile): boolean {
  const st = tile.structure;
  if (!st) return false;
  return !st.offlineUntil || st.offlineUntil <= state.turn;
}

export function connectedToGrid(state: GameState, player: Player, tile: Tile): boolean {
  if (!tile.structure || tile.structure.owner !== player.id) return false;
  if (tile.structure.kind === 'substation') return true;
  return attachedSubstation(state, tile, player.id, BALANCE.attachRadius) !== null;
}

export function dcRequest(state: GameState, player: Player, tile: Tile, ctx: DispatchContext): { request: number; pue: number; util: number } {
  const st = tile.structure;
  if (!st || !isComputeKind(st.kind)) return { request: 0, pue: 1, util: 0 };
  const pue = effectivePue(state, player, tile, st.kind);
  const util = policyUtilization(st.policy ?? player.policy, ctx.computePrice, ctx.powerPrice);
  const request = STRUCTURES[st.kind].mw * pue * util * techMods(player).dcLoad;
  return { request, pue, util };
}

function marginalCost(kind: StructureKind, fuelMult: number): number {
  const def = STRUCTURES[kind];
  if (kind === 'solar' || kind === 'wind') return 0.05;
  if (kind === 'hydro') return 0.3;
  if (kind === 'geothermal') return 0.4;
  if (kind === 'battery') return 0.25;
  if (kind === 'nuclear') return (def.fuel ?? 0) * 1.2;
  if (kind === 'gas') return (def.fuel ?? 0) * fuelMult;
  return 0.1;
}

// ---------------------------------------------------------------------------
// Min-cost max-flow (successive shortest paths with Bellman-Ford)
// ---------------------------------------------------------------------------

interface Edge {
  to: number;
  rev: number;
  cap: number;
  cost: number;
}

interface FlowNetwork {
  adjacency: Edge[][];
}

function createNetwork(size: number): FlowNetwork {
  return { adjacency: Array.from({ length: size }, () => [] as Edge[]) };
}

function addEdge(net: FlowNetwork, from: number, to: number, cap: number, cost: number): number {
  const fwd: Edge = { to, rev: net.adjacency[to].length, cap, cost };
  const rev: Edge = { to: from, rev: net.adjacency[from].length, cap: 0, cost: -cost };
  net.adjacency[from].push(fwd);
  net.adjacency[to].push(rev);
  return net.adjacency[from].length - 1;
}

function minCostMaxFlow(net: FlowNetwork, source: number, sink: number): void {
  const n = net.adjacency.length;
  for (let guard = 0; guard < 500; guard++) {
    const dist = new Array<number>(n).fill(Infinity);
    const prevNode = new Array<number>(n).fill(-1);
    const prevEdge = new Array<number>(n).fill(-1);
    dist[source] = 0;
    for (let pass = 0; pass < n; pass++) {
      let changed = false;
      for (let u = 0; u < n; u++) {
        if (dist[u] === Infinity) continue;
        const edges = net.adjacency[u];
        for (let i = 0; i < edges.length; i++) {
          const e = edges[i];
          if (e.cap <= 1e-6) continue;
          const nd = dist[u] + e.cost;
          if (nd < dist[e.to] - 1e-9) {
            dist[e.to] = nd;
            prevNode[e.to] = u;
            prevEdge[e.to] = i;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    if (dist[sink] === Infinity) return;
    let bottleneck = Infinity;
    for (let v = sink; v !== source; v = prevNode[v]) {
      if (prevNode[v] < 0) return;
      bottleneck = Math.min(bottleneck, net.adjacency[prevNode[v]][prevEdge[v]].cap);
    }
    if (!Number.isFinite(bottleneck) || bottleneck <= 1e-6) return;
    for (let v = sink; v !== source; v = prevNode[v]) {
      const edge = net.adjacency[prevNode[v]][prevEdge[v]];
      edge.cap -= bottleneck;
      net.adjacency[v][edge.rev].cap += bottleneck;
    }
  }
}

function flowOn(net: FlowNetwork, from: number, edgeIndex: number, originalCap: number): number {
  const edge = net.adjacency[from][edgeIndex];
  return Math.max(0, originalCap - edge.cap);
}

// ---------------------------------------------------------------------------

export interface IslandAssets {
  subs: Tile[];
  generators: Tile[];
  compute: Tile[];
  batteries: Tile[];
}

interface IslandSolve {
  dispatch: Map<Tile, number>;
  batteryOut: Map<Tile, number>;
  loadFlow: Map<Tile, number>;
  lineFlow: Map<string, number>;
  imported: number;
  potential: number;
  load: number;
  served: number;
  batteryAvailable: number;
  importCapacity: number;
}

function solveIsland(state: GameState, player: Player, island: IslandAssets, ctx: DispatchContext): IslandSolve {
  const throughput = substationThroughput(player);
  const lineCap = lineCapacity(player);
  const subIndex = new Map<string, number>();
  island.subs.forEach((sub, i) => subIndex.set(`${sub.x},${sub.y}`, i));

  const output = new Map<Tile, number>();
  for (const g of island.generators) output.set(g, structureOutput(state, player, g));

  const source = 0;
  const sink = 1;
  const subBase = 2;
  const genBase = subBase + island.subs.length * 2;
  const loadBase = genBase + island.generators.length;
  const impBase = loadBase + island.compute.length;
  const batteryBase = impBase + island.subs.length;
  const net = createNetwork(batteryBase + island.batteries.length);
  const subIn = (i: number) => subBase + i * 2;
  const subOut = (i: number) => subBase + i * 2 + 1;
  const importRights = throughput * 0.5;

  for (let i = 0; i < island.subs.length; i++) addEdge(net, subIn(i), subOut(i), throughput, 0);

  for (const link of state.links) {
    if (link.owner !== player.id) continue;
    const ai = subIndex.get(`${link.a.x},${link.a.y}`);
    const bi = subIndex.get(`${link.b.x},${link.b.y}`);
    if (ai === undefined || bi === undefined) continue;
    addEdge(net, subOut(ai), subIn(bi), lineCap, 0.04);
    addEdge(net, subOut(bi), subIn(ai), lineCap, 0.04);
  }

  const genEdges: { tile: Tile; index: number; cap: number }[] = [];
  island.generators.forEach((g, i) => {
    const st = g.structure;
    if (!st) return;
    const out = output.get(g) ?? 0;
    const node = genBase + i;
    addEdge(net, source, node, out, marginalCost(st.kind, ctx.fuelMult));
    const sub = attachedSubstation(state, g, player.id, BALANCE.attachRadius);
    const si = sub ? subIndex.get(`${sub.x},${sub.y}`) : undefined;
    if (si === undefined) return;
    addEdge(net, node, subIn(si), out, 0);
    genEdges.push({ tile: g, index: net.adjacency[source].length - 1, cap: out });
  });

  const importPrice = ctx.powerPrice * BALANCE.importUplift;
  const impEdges: { index: number }[] = [];
  for (let i = 0; i < island.subs.length; i++) {
    const node = impBase + i;
    addEdge(net, source, node, importRights, importPrice);
    addEdge(net, node, subIn(i), importRights, 0);
    impEdges.push({ index: net.adjacency[source].length - 1 });
  }

  island.compute.forEach((tile, i) => {
    const sub = attachedSubstation(state, tile, player.id, BALANCE.attachRadius);
    const si = sub ? subIndex.get(`${sub.x},${sub.y}`) : undefined;
    if (si === undefined) return;
    const { request } = dcRequest(state, player, tile, ctx);
    const node = loadBase + i;
    addEdge(net, subOut(si), node, request, 0);
    addEdge(net, node, sink, request, -1000);
  });

  const batteryEdges: { tile: Tile; index: number; cap: number }[] = [];
  island.batteries.forEach((tile, i) => {
    const st = tile.structure;
    if (!st) return;
    const available = Math.min(STRUCTURES.battery.rate ?? 0, st.charge ?? 0);
    if (available <= 0) return;
    const sub = attachedSubstation(state, tile, player.id, BALANCE.attachRadius);
    const si = sub ? subIndex.get(`${sub.x},${sub.y}`) : undefined;
    if (si === undefined) return;
    const node = batteryBase + i;
    addEdge(net, source, node, available, marginalCost('battery', ctx.fuelMult));
    addEdge(net, node, subIn(si), available, 0);
    batteryEdges.push({ tile, index: net.adjacency[source].length - 1, cap: available });
  });

  minCostMaxFlow(net, source, sink);

  const dispatch = new Map<Tile, number>();
  const batteryOut = new Map<Tile, number>();
  const loadFlow = new Map<Tile, number>();
  let potential = 0;
  for (const e of genEdges) {
    const used = flowOn(net, source, e.index, e.cap);
    dispatch.set(e.tile, used);
    potential += e.cap;
  }
  for (const e of batteryEdges) {
    batteryOut.set(e.tile, flowOn(net, source, e.index, e.cap));
  }
  island.compute.forEach((tile, i) => {
    const node = loadBase + i;
    const edge = net.adjacency[node].find((e) => e.to === sink && e.cost === -1000);
    if (!edge) return;
    const { request } = dcRequest(state, player, tile, ctx);
    loadFlow.set(tile, Math.max(0, request - edge.cap));
  });

  let imported = 0;
  for (let i = 0; i < island.subs.length; i++) {
    const edge = net.adjacency[source][impEdges[i].index];
    imported += Math.max(0, importRights - edge.cap);
  }

  const lineFlow = new Map<string, number>();
  for (const link of state.links) {
    if (link.owner !== player.id) continue;
    const ai = subIndex.get(`${link.a.x},${link.a.y}`);
    const bi = subIndex.get(`${link.b.x},${link.b.y}`);
    if (ai === undefined || bi === undefined) continue;
    const edge = net.adjacency[subOut(ai)].find((e) => e.to === subIn(bi) && e.cost === 0.04);
    if (!edge) continue;
    const used = Math.max(0, lineCap - edge.cap);
    if (used > 0.01) lineFlow.set(`${link.a.x},${link.a.y}-${link.b.x},${link.b.y}`, used);
  }

  let load = 0;
  for (const tile of island.compute) load += dcRequest(state, player, tile, ctx).request;
  const served = [...loadFlow.values()].reduce((a, b) => a + b, 0);
  const batteryAvailable = island.batteries.reduce(
    (sum, b) => sum + Math.min(STRUCTURES.battery.rate ?? 0, b.structure?.charge ?? 0),
    0,
  );

  return {
    dispatch,
    batteryOut,
    loadFlow,
    lineFlow,
    imported,
    potential,
    load,
    served,
    batteryAvailable,
    importCapacity: island.subs.length * importRights,
  };
}

/** Connected components of a player's substations joined by built corridors. */
export function islandsOf(state: GameState, playerId: number): IslandAssets[] {
  const subs = playerSubstations(state, playerId);
  if (!subs.length) return [];
  const keyOf = (p: Pos) => `${p.x},${p.y}`;
  const parent = new Map<string, string>();
  for (const s of subs) parent.set(keyOf(s), keyOf(s));
  const find = (a: string): string => {
    let cur = a;
    while (parent.get(cur) !== cur) cur = parent.get(cur) ?? cur;
    return cur;
  };
  for (const link of state.links) {
    if (link.owner !== playerId) continue;
    const ka = keyOf(link.a);
    const kb = keyOf(link.b);
    if (!parent.has(ka) || !parent.has(kb)) continue;
    const ra = find(ka);
    const rb = find(kb);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<string, Tile[]>();
  for (const s of subs) {
    const root = find(keyOf(s));
    const list = groups.get(root) ?? [];
    list.push(s);
    groups.set(root, list);
  }
  const assets = playerStructures(state, playerId);
  const out: IslandAssets[] = [];
  for (const group of groups.values()) {
    const subKeys = new Set(group.map(keyOf));
    const generators: Tile[] = [];
    const compute: Tile[] = [];
    const batteries: Tile[] = [];
    for (const { tile } of assets) {
      if (!isOnline(state, tile)) continue;
      const sub = attachedSubstation(state, tile, playerId, BALANCE.attachRadius);
      if (!sub || !subKeys.has(keyOf(sub))) continue;
      const kind = tile.structure?.kind;
      if (kind === 'battery') batteries.push(tile);
      else if (kind && isGeneratorKind(kind)) generators.push(tile);
      else if (kind && isComputeKind(kind)) compute.push(tile);
    }
    out.push({ subs: group, generators, compute, batteries });
  }
  return out;
}

export function dispatchPlayer(state: GameState, playerId: number, ctx: DispatchContext): DispatchResult {
  const player = state.players[playerId];
  const mods = techMods(player);
  const islands = islandsOf(state, playerId);
  const reports: GridReport[] = [];
  const dcUtil: Record<string, number> = {};
  const linkFlow: Record<string, number> = {};
  let generation = 0;
  let load = 0;
  let served = 0;
  let imported = 0;
  let charged = 0;
  let discharged = 0;
  let curtailed = 0;
  let computeSum = 0;
  let itDelivered = 0;
  let flexIncome = 0;
  let fuelCost = 0;
  let exportsTotal = 0;
  let exportBudget = BALANCE.exportCap;

  const importPrice = ctx.powerPrice * BALANCE.importUplift;
  const exportPrice = ctx.powerPrice * BALANCE.exportHaircut;
  const lineCount = Math.max(1, state.links.filter((l) => l.owner === playerId).length);

  islands.forEach((island, islandIndex) => {
    const solved = solveIsland(state, player, island, ctx);
    // Surplus = generation that was available but not dispatched to load, plus
    // any imported power beyond consumption. Charging and exports soak it up.
    const dispatchedGen = [...solved.dispatch.values()].reduce((a, b) => a + b, 0);
    let surplus = Math.max(0, solved.potential - dispatchedGen + Math.max(0, solved.imported + dispatchedGen - solved.served));

    let islandCharged = 0;
    let islandDischarged = 0;
    for (const tile of island.batteries) {
      const st = tile.structure;
      if (!st) continue;
      const stored = st.charge ?? 0;
      const out = solved.batteryOut.get(tile) ?? 0;
      st.charge = Math.max(0, stored - out);
      islandDischarged += out;
      const rate = STRUCTURES.battery.rate ?? 0;
      const storage = STRUCTURES.battery.storage ?? 0;
      const room = Math.max(0, storage - (st.charge ?? 0));
      const take = Math.min(rate, surplus, room / BALANCE.batteryEfficiency);
      if (take > 0.01) {
        st.charge = (st.charge ?? 0) + take * BALANCE.batteryEfficiency;
        surplus -= take;
        islandCharged += take;
      }
    }

    const exportable = Math.min(surplus, exportBudget);
    exportBudget -= exportable;
    exportsTotal += exportable;
    const islandCurtailed = Math.max(0, surplus - exportable);
    curtailed += islandCurtailed;

    let islandCompute = 0;
    for (const tile of island.compute) {
      const st = tile.structure;
      if (!st) continue;
      const def = STRUCTURES[st.kind];
      const { pue, request } = dcRequest(state, player, tile, ctx);
      const delivered = solved.loadFlow.get(tile) ?? 0;
      dcUtil[`${tile.x},${tile.y}`] = request > 0.001 ? Math.min(1, delivered / request) : 0;
      const it = delivered / pue;
      itDelivered += it;
      islandCompute += it * (def.eff ?? 1) * mods.compute * TERRAINS[tile.terrain].compute;
      const policy = st.policy ?? player.policy;
      if (policy === 'flex') flexIncome += it * BALANCE.flexBase * mods.flex * flexEventMultiplier(state.market.events);
    }

    const firm =
      island.generators.reduce((sum, g) => {
        const kind = g.structure?.kind;
        return kind === 'gas' || kind === 'hydro' || kind === 'nuclear' || kind === 'geothermal'
          ? sum + structureOutput(state, player, g)
          : sum;
      }, 0) +
      solved.batteryAvailable +
      solved.importCapacity;
    const reserve = Math.max(0, firm - solved.served) / Math.max(1, solved.served);
    let policyBias = 0;
    for (const tile of island.compute) {
      const policy = tile.structure?.policy ?? player.policy;
      if (policy === 'flex') policyBias += 3;
      else if (policy === 'reliability') policyBias += 5;
      else if (policy === 'compute') policyBias -= 2;
    }
    policyBias = Math.max(-8, Math.min(10, policyBias));
    const unservedShare = solved.load > 0 ? Math.max(0, solved.load - solved.served) / solved.load : 0;
    const congested = [...solved.lineFlow.values()].filter((flow) => flow / Math.max(1, lineCapacity(player)) > BALANCE.congestedAt).length;
    let stability =
      62 +
      34 * Math.min(1, reserve / 0.35) -
      22 * unservedShare -
      14 * (congested / lineCount) +
      mods.stability +
      policyBias +
      stabilityEventPenalty(state.market.events);
    stability = Math.max(0, Math.min(100, stability));
    const stabilityFactor = stability < 20 ? 0.6 : stability < 35 ? 0.8 : stability < 50 ? 0.92 : 1;
    computeSum += islandCompute * stabilityFactor;

    for (const [edgeKey, used] of solved.lineFlow) linkFlow[edgeKey] = used;
    for (const [tile, used] of solved.dispatch) {
      const kind = tile.structure?.kind;
      if (kind === 'gas' || kind === 'nuclear') fuelCost += used * (STRUCTURES[kind].fuel ?? 0) * ctx.fuelMult;
    }

    reports.push({
      islandId: islandIndex,
      substations: island.subs.map((s) => ({ x: s.x, y: s.y })),
      generation: solved.potential,
      load: solved.load,
      served: solved.served,
      imported: solved.imported,
      exported: exportable,
      charged: islandCharged,
      discharged: islandDischarged,
      capacity: solved.potential + solved.batteryAvailable + solved.importCapacity,
      reserve,
      stability,
      congested,
      curtailed: islandCurtailed,
    });

    generation += solved.potential;
    load += solved.load;
    served += solved.served;
    imported += solved.imported;
    charged += islandCharged;
    discharged += islandDischarged;
  });

  // Assets outside every substation radius cannot deliver or draw power.
  for (const { tile } of playerStructures(state, playerId)) {
    if (!isOnline(state, tile) || tile.structure?.kind === 'substation') continue;
    if (attachedSubstation(state, tile, playerId, BALANCE.attachRadius)) continue;
    const kind = tile.structure?.kind;
    if (kind && isComputeKind(kind)) {
      const { request } = dcRequest(state, player, tile, ctx);
      dcUtil[`${tile.x},${tile.y}`] = 0;
      load += request;
    }
  }

  let maintenance = 0;
  for (const { structure } of playerStructures(state, playerId)) maintenance += STRUCTURES[structure.kind].maintenance;
  maintenance += state.links.filter((l) => l.owner === playerId).length * 0.8;

  let research = 0;
  for (const { structure } of playerStructures(state, playerId)) research += STRUCTURES[structure.kind].rp ?? 0;
  research *= researchMultiplier(state.market.events);

  const powerRevenue = exportsTotal * exportPrice + flexIncome;
  const powerCost = imported * importPrice;
  const report: PlayerTurnReport = {
    playerId,
    generation,
    load,
    served,
    imported,
    exported: exportsTotal,
    charged,
    discharged,
    curtailed,
    compute: computeSum,
    itMW: itDelivered,
    computeRevenue: 0,
    powerRevenue,
    powerCost,
    fuelCost,
    maintenance,
    net: 0,
    research,
    stability: reports.length ? Math.min(...reports.map((r) => r.stability)) : 0,
    islands: reports,
    dcUtil,
    linkFlow,
  };

  return { report, compute: computeSum, itDelivered, flexIncome };
}

/** Non-destructive dispatch used for UI projections and AI planning. */
export function previewPlayer(state: GameState, playerId: number, ctx?: DispatchContext): DispatchResult {
  const context: DispatchContext = ctx ?? {
    powerPrice: state.market.powerPrice,
    computePrice: state.market.computePrice,
    fuelMult: 1,
  };
  const snapshot = new Map<Tile, number>();
  for (const tile of state.tiles) {
    if (tile.structure?.kind === 'battery' && tile.structure.owner === playerId) snapshot.set(tile, tile.structure.charge ?? 0);
  }
  const result = dispatchPlayer(state, playerId, context);
  for (const [tile, charge] of snapshot) {
    if (tile.structure) tile.structure.charge = charge;
  }
  return result;
}
