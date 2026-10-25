/** Local save slots with defensive parsing. */
import type { GameState } from './types';

const KEY = 'gridpower.save.v1';
const STAMP_KEY = 'gridpower.savedAt.v1';

export interface SaveSummary {
  exists: boolean;
  turn: number;
  savedAt: number;
  playerName: string;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function parseSave(raw: string): GameState | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const candidate = data as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  if (typeof candidate.turn !== 'number' || typeof candidate.size !== 'number') return null;
  const { tiles, players, links, market, victory, weather, report, history } = candidate;
  if (!Array.isArray(tiles) || !Array.isArray(players) || !Array.isArray(links)) return null;
  if (tiles.length !== candidate.size * candidate.size) return null;
  if (!Array.isArray(report) || !Array.isArray(history)) return null;
  if (typeof market !== 'object' || market === null || typeof victory !== 'object' || victory === null) return null;
  if (typeof weather !== 'object' || weather === null) return null;
  // Every field the UI and engine read has been checked above; a save produced by
  // another build is rejected by the version check.
  return data as GameState;
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, serialize(state));
    localStorage.setItem(STAMP_KEY, String(Date.now()));
  } catch {
    // Storage can be unavailable in private browsing; the session still works.
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return parseSave(raw);
  } catch {
    return null;
  }
}

export function saveSummary(): SaveSummary {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { exists: false, turn: 0, savedAt: 0, playerName: '' };
  }
  if (!raw) return { exists: false, turn: 0, savedAt: 0, playerName: '' };
  const state = parseSave(raw);
  if (!state) return { exists: false, turn: 0, savedAt: 0, playerName: '' };
  const savedAt = Number(localStorage.getItem(STAMP_KEY) ?? 0);
  return { exists: true, turn: state.turn, savedAt, playerName: state.players[0]?.name ?? '' };
}

export function clearSave(): void {
  localStorage.removeItem(KEY);
}

export function exportSave(state: GameState): string {
  return btoa(unescape(encodeURIComponent(serialize(state))));
}

export function importSave(encoded: string): GameState | null {
  try {
    return parseSave(decodeURIComponent(escape(atob(encoded.trim()))));
  } catch {
    return null;
  }
}

export { KEY as SAVE_KEY };
