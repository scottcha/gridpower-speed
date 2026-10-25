/** Headless match runner shared by the simulation script and the test suite. */
import { createGame } from './worldgen';
import { endTurn } from './simulation';
import { BALANCE } from './config';
import { playerStructures } from './board';
import { isComputeKind, isGeneratorKind } from './progression';
import type { GameState, Player } from './types';

export interface HeadlessOptions {
  seed: number;
  size?: number;
  maxTurns?: number;
  allAi?: boolean;
  playerName?: string;
  onTurn?: (state: GameState) => void;
}

export interface PlayerResult {
  id: number;
  corp: string;
  compute: number;
  credits: number;
  structures: number;
  dataCenters: number;
  generators: number;
  techs: number;
  stability: number;
  score: number;
  bankrupt: boolean;
  isAI: boolean;
}

export interface MatchResult {
  seed: number;
  size: number;
  turns: number;
  winner: number | null;
  winnerCorp: string | null;
  kind: string | null;
  over: boolean;
  durationsMs: number;
  players: PlayerResult[];
  problems: string[];
}

function summarizePlayer(state: GameState, player: Player): PlayerResult {
  const assets = playerStructures(state, player.id);
  const generators = assets.filter(({ structure }) => isGeneratorKind(structure.kind));
  const centers = assets.filter(({ structure }) => isComputeKind(structure.kind));
  return {
    id: player.id,
    corp: player.corp,
    compute: Math.round(state.report[player.id]?.compute ?? 0),
    credits: Math.round(player.credits),
    structures: assets.length,
    dataCenters: centers.length,
    generators: generators.length,
    techs: player.techs.length,
    stability: Math.round(state.report[player.id]?.stability ?? 0),
    score: state.victory.progress[player.id]?.score ?? 0,
    bankrupt: player.bankrupt,
    isAI: player.isAI,
  };
}

export function runHeadlessMatch(options: HeadlessOptions): MatchResult {
  const started = Date.now();
  const size = options.size ?? 20;
  const maxTurns = options.maxTurns ?? BALANCE.maxTurns;
  const state = createGame({
    seed: options.seed,
    size,
    maxTurns,
    playerName: options.playerName ?? 'Lumen Grid',
    credits: BALANCE.startCredits,
  });
  if (options.allAi !== false) {
    state.players[0].isAI = true;
    state.players[0].persona = 'helios';
    state.players[0].name = 'Lumen Grid';
    state.players[0].corp = 'Lumen Grid';
  }
  const problems: string[] = [];
  let guard = 0;
  while (!state.victory.over && guard < maxTurns + 2) {
    const beforeTurn = state.turn;
    const beforeAssets = state.tiles.reduce((sum, t) => (t.structure ? sum + 1 : sum), 0);
    try {
      endTurn(state);
    } catch (error) {
      problems.push(`turn ${beforeTurn} crashed: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
    const afterAssets = state.tiles.reduce((sum, t) => (t.structure ? sum + 1 : sum), 0);
    if (state.turn === beforeTurn && !state.victory.over) {
      problems.push(`turn ${beforeTurn} did not advance`);
      break;
    }
    if (beforeTurn > 6 && afterAssets === beforeAssets && state.players.every((p) => p.bankrupt)) {
      problems.push('economy stalled with no assets');
      break;
    }
    if (state.players[0].credits < -100000) problems.push('runaway debt');
    options.onTurn?.(state);
    guard++;
  }
  if (!state.victory.over) problems.push('no victory condition fired before the horizon');
  const assets = state.tiles.reduce((sum, t) => sum + (t.structure ? 1 : 0), 0);
  if (assets < 20) problems.push(`only ${assets} structures on the map at the end`);
  for (const p of state.players) {
    if (!p.bankrupt && p.credits > 400000) problems.push(`runaway credits for ${p.corp}: ${Math.round(p.credits)}`);
  }
  return {
    seed: options.seed,
    size,
    turns: state.history.length,
    winner: state.victory.winner,
    winnerCorp: state.victory.winner !== null ? state.players[state.victory.winner].corp : null,
    kind: state.victory.kind,
    over: state.victory.over,
    durationsMs: Date.now() - started,
    players: state.players.map((p) => summarizePlayer(state, p)),
    problems,
  };
}

export function describeMatch(result: MatchResult): string {
  const winner = result.winnerCorp ?? 'nobody';
  const lines = [
    `seed ${result.seed} · ${result.turns} turns · ${result.durationsMs}ms · winner: ${winner} (${result.kind ?? 'none'})`,
  ];
  for (const p of result.players) {
    lines.push(
      `  ${p.corp.padEnd(14)} ${p.compute.toString().padStart(5)} CU  ` +
        `$${p.credits.toString().padStart(6)}  ${p.dataCenters}DC/${p.generators}GEN  ` +
        `${p.techs} techs  stab ${p.stability}  score ${p.score}${p.bankrupt ? '  BANKRUPT' : ''}`,
    );
  }
  for (const problem of result.problems) lines.push(`  ! ${problem}`);
  return lines.join('\n');
}
