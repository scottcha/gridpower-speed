/** Turn resolution: markets clear, storage settles, victory is evaluated. */
import { BALANCE, STRUCTURES } from './config';
import { playerStructures } from './board';
import { connectedToGrid, dispatchPlayer, isOnline, previewPlayer, structureOutput, type DispatchContext, type DispatchResult } from './grid';
import {
  applyGrants,
  computePriceFor,
  eventMultiplier,
  pickForecastWeather,
  powerPriceFor,
  rollEvents,
  rollForecast,
  tickEvents,
} from './markets';
import { hasTech } from './progression';
import { runAiTurns } from './ai';
import type {
  GameState,
  LogKind,
  Player,
  PlayerTurnReport,
  TurnRecord,
  TurnSummary,
  VictoryProgress,
} from './types';

export function contextFor(state: GameState): DispatchContext {
  return {
    powerPrice: state.market.powerPrice,
    computePrice: state.market.computePrice,
    fuelMult: eventMultiplier(state.market.events, 'fuelMult'),
  };
}

export { previewPlayer };

export function firmCapacity(state: GameState, player: Player): number {
  let firm = 0;
  for (const { tile, structure } of playerStructures(state, player.id)) {
    if (!isOnline(state, tile) || !connectedToGrid(state, player, tile)) continue;
    if (structure.kind === 'battery') firm += STRUCTURES.battery.rate ?? 0;
    if (structure.kind === 'gas' || structure.kind === 'hydro' || structure.kind === 'nuclear' || structure.kind === 'geothermal') {
      firm += structureOutput(state, player, tile);
    }
  }
  return firm;
}

export function scoreOf(player: Player, progress: VictoryProgress): number {
  return Math.round(
    player.stats.totalCompute * 1.6 +
      progress.firmMw * 1.4 +
      player.techs.length * 70 +
      Math.max(0, player.credits) * 0.02,
  );
}

function pushLog(state: GameState, kind: LogKind, playerId: number | null, text: string): void {
  state.log.push({ turn: state.turn, playerId, kind, text });
  if (state.log.length > 240) state.log.splice(0, state.log.length - 240);
}

function settlePlayer(player: Player, result: DispatchResult, computePrice: number): PlayerTurnReport {
  const report = result.report;
  report.computeRevenue = result.compute * computePrice;
  report.net =
    report.computeRevenue +
    report.powerRevenue -
    report.powerCost -
    report.fuelCost -
    report.maintenance;
  player.credits += report.net;
  player.research += report.research;
  player.stats.totalCompute += report.compute;
  player.stats.totalRevenue += report.computeRevenue + report.powerRevenue;
  player.stats.peakCompute = Math.max(player.stats.peakCompute, report.compute);
  player.stats.peakCredits = Math.max(player.stats.peakCredits, player.credits);
  player.aiMemory.lastShortfall = Math.max(0, report.load - report.served);
  player.aiMemory.lastStability = report.stability;
  return report;
}

export function evaluateVictory(state: GameState, reports: PlayerTurnReport[], itDelivered: number[]): void {
  const totalCompute = reports.reduce((sum, r) => sum + r.compute, 0);
  const cfg = BALANCE.victory;
  let winner: number | null = null;
  let kind: 'compute' | 'energy' | 'tech' | 'score' | null = null;

  state.players.forEach((player, index) => {
    const progress = state.victory.progress[index];
    const report = reports[index];
    const share = totalCompute > 0 ? report.compute / totalCompute : 0;
    progress.computeShare = share;
    progress.computeStreak = share >= cfg.computeShare ? progress.computeStreak + 1 : 0;
    progress.firmMw = firmCapacity(state, player);
    progress.minStability = report.islands.length ? Math.min(...report.islands.map((i) => i.stability)) : 0;
    const energyOk = progress.firmMw >= cfg.firmMw && progress.minStability >= cfg.stability && player.credits >= cfg.credits;
    progress.energyStreak = energyOk ? progress.energyStreak + 1 : 0;
    const fleetEff = itDelivered[index] > 0 ? report.compute / itDelivered[index] : 0;
    progress.efficientCompute = fleetEff >= 1.3 ? report.compute : 0;
    progress.techComplete = hasTech(player, 'autonomousFleet');
    const techOk = progress.techComplete && progress.efficientCompute >= cfg.efficientCompute;
    progress.techStreak = techOk ? progress.techStreak + 1 : 0;
    progress.score = scoreOf(player, progress);

    if (!player.bankrupt && !winner) {
      if (progress.computeStreak >= cfg.computeTurns) {
        winner = player.id;
        kind = 'compute';
      } else if (progress.energyStreak >= cfg.energyTurns) {
        winner = player.id;
        kind = 'energy';
      } else if (progress.techStreak >= cfg.techTurns) {
        winner = player.id;
        kind = 'tech';
      }
    }
  });

  // Fixed-horizon score victory.
  if (!winner && state.turn >= state.maxTurns) {
    let best = -Infinity;
    for (const p of state.players) {
      if (p.bankrupt) continue;
      const score = state.victory.progress[p.id].score;
      if (score > best) {
        best = score;
        winner = p.id;
      }
    }
    kind = 'score';
  }

  if (winner !== null) {
    state.victory.over = true;
    state.victory.winner = winner;
    state.victory.kind = kind;
    pushLog(state, 'victory', winner, `${state.players[winner].corp} wins by ${kind}.`);
  }
}

function liquidate(state: GameState, player: Player): void {
  player.bankrupt = true;
  for (const tile of state.tiles) {
    if (tile.owner === player.id) tile.owner = null;
    if (tile.structure?.owner === player.id) tile.structure = null;
  }
  state.links = state.links.filter((l) => l.owner !== player.id);
  pushLog(state, 'warn', player.id, `${player.corp} is insolvent and its assets are liquidated.`);
}

export function resolveTurn(state: GameState): TurnSummary {
  if (state.victory.over) {
    return state.summary ?? {
      turn: state.turn,
      weatherId: state.weather.id,
      weatherName: state.weather.name,
      events: state.market.events,
      powerPrice: state.market.powerPrice,
      computePrice: state.market.computePrice,
      demand: state.market.demand,
      supply: state.market.supply,
      highlights: [],
    };
  }

  const ctx = contextFor(state);
  const results = state.players.map((p) => (p.bankrupt ? emptyDispatch(p.id) : dispatchPlayer(state, p.id, ctx)));
  const totalCompute = results.reduce((sum, r) => sum + r.compute, 0);
  const computeMult = eventMultiplier(state.market.events, 'computePriceMult');
  const computePrice = computePriceFor(state.market.demand, totalCompute, BALANCE.computeBase, computeMult);
  state.market.supply = totalCompute;
  state.market.computePrice = computePrice;

  const grant = applyGrants(
    state.players.filter((p) => !p.bankrupt),
    state.market.events,
  );

  const reports = state.players.map((p, i) => settlePlayer(p, results[i], computePrice));
  state.report = reports;

  // Insolvency: three consecutive turns below the floor ends a company.
  for (const player of state.players) {
    if (player.bankrupt) continue;
    if (player.credits < BALANCE.startTreasuryFloor) {
      player.deficitStreak += 1;
      if (player.deficitStreak >= BALANCE.insolvencyTurns) {
        if (player.isAI) liquidate(state, player);
        else {
          state.victory.over = true;
          state.victory.winner = null;
          state.victory.kind = 'insolvency';
          pushLog(state, 'warn', player.id, `${player.corp} cannot service its debt. The board removes you.`);
        }
      }
    } else {
      player.deficitStreak = 0;
    }
  }

  evaluateVictory(state, reports, results.map((r) => r.itDelivered));

  const humanReport = reports[0];
  const highlights: string[] = [];
  highlights.push(`${state.weather.name}: ${state.weather.blurb}`);
  for (const event of state.market.events) if (event.turnsLeft >= 1) highlights.push(`${event.label} — ${event.desc}`);
  if (grant > 0) highlights.push(`Subsidy paid out: +$${grant} to every company.`);
  highlights.push(`Market cleared ${Math.round(totalCompute)} CU against ${Math.round(state.market.demand)} CU of demand — $${computePrice.toFixed(1)}/CU.`);
  if (humanReport.imported > humanReport.load * 0.2 && humanReport.load > 0) {
    highlights.push(`Imported ${humanReport.imported.toFixed(0)} MW at a premium — build generation to improve margins.`);
  }
  if (humanReport.stability < 50 && humanReport.islands.length) {
    highlights.push(`Grid stability at ${humanReport.stability.toFixed(0)}% — add firm capacity or batteries.`);
  }
  const leader = [...state.players].sort((a, b) => state.victory.progress[b.id].computeShare - state.victory.progress[a.id].computeShare)[0];
  if (leader && leader.id !== 0) {
    highlights.push(`${leader.corp} leads the compute market at ${(state.victory.progress[leader.id].computeShare * 100).toFixed(0)}% share.`);
  }

  const record: TurnRecord = {
    turn: state.turn,
    weather: state.weather.id,
    powerPrice: state.market.powerPrice,
    computePrice,
    demand: state.market.demand,
    players: state.players.map((p, i) => ({
      playerId: p.id,
      credits: Math.round(p.credits),
      compute: Math.round(reports[i].compute),
      revenue: Math.round(reports[i].computeRevenue + reports[i].powerRevenue),
      generation: Math.round(reports[i].generation),
      stability: Math.round(reports[i].stability),
      share: state.victory.progress[p.id].computeShare,
      score: state.victory.progress[p.id].score,
      techs: p.techs.length,
    })),
  };
  state.history.push(record);
  if (state.history.length > 60) state.history.shift();

  for (const player of state.players) {
    if (player.isAI) continue;
    if (reports[player.id].net < 0) {
      pushLog(state, 'warn', player.id, `Operating loss of $${Math.abs(reports[player.id].net).toFixed(0)} this turn.`);
    }
  }

  const summary: TurnSummary = {
    turn: state.turn,
    weatherId: state.weather.id,
    weatherName: state.weather.name,
    events: state.market.events.map((e) => ({ ...e })),
    powerPrice: state.market.powerPrice,
    computePrice,
    demand: state.market.demand,
    supply: totalCompute,
    highlights,
  };
  state.summary = summary;
  state.lastSummaryTurn = state.turn;

  if (state.victory.over) {
    state.revision++;
    return summary;
  }

  // ---- Advance to the next turn ----
  state.turn += 1;
  state.market.events = tickEvents(state.market.events);
  const nextWeather = pickForecastWeather(state);
  state.weather = nextWeather;
  state.market.forecast = rollForecast(state);
  const freshEvents = rollEvents(state);
  state.market.events = [...state.market.events, ...freshEvents];
  state.market.demand = Math.round(BALANCE.demandBase * Math.pow(BALANCE.demandGrowth, state.turn - 1));
  state.market.powerPrice = powerPriceFor(BALANCE.powerBase, nextWeather, state.market.events, state.turn);

  pushLog(state, 'weather', null, `${nextWeather.name}: ${nextWeather.blurb}`);
  for (const event of freshEvents) {
    pushLog(state, 'market', null, `${event.label}: ${event.desc}`);
  }

  const human0 = state.players[0];
  if (!human0.bankrupt) {
    const current = previewPlayer(state, 0);
    if (current.report.load > 0 && current.report.served < current.report.load * 0.9) {
      pushLog(state, 'warn', 0, `Your data centers are short ${Math.round(current.report.load - current.report.served)} MW.`);
    }
  }
  state.revision++;
  return summary;
}

export function endTurn(state: GameState): TurnSummary {
  if (state.victory.over) {
    return state.summary ?? {
      turn: state.turn,
      weatherId: state.weather.id,
      weatherName: state.weather.name,
      events: state.market.events,
      powerPrice: state.market.powerPrice,
      computePrice: state.market.computePrice,
      demand: state.market.demand,
      supply: state.market.supply,
      highlights: [],
    };
  }
  runAiTurns(state);
  return resolveTurn(state);
}

function emptyDispatch(playerId: number): DispatchResult {
  return {
    report: {
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
      stability: 0,
      islands: [],
      dcUtil: {},
      linkFlow: {},
    },
    compute: 0,
    itDelivered: 0,
    flexIncome: 0,
  };
}
