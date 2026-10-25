/** Board geometry and tile queries shared by every system. */
import { TERRAINS } from './config';
import type { GameState, Pos, Structure, Tile, Terrain } from './types';

export interface Board {
  size: number;
  tiles: Tile[];
}

export const key = (x: number, y: number): string => `${x},${y}`;

export const tileAt = (board: Board, x: number, y: number): Tile | null => {
  if (x < 0 || y < 0 || x >= board.size || y >= board.size) return null;
  return board.tiles[y * board.size + x];
};

export const isLandTerrain = (terrain: Terrain): boolean => TERRAINS[terrain].land;

export const manhattan = (a: Pos, b: Pos): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const chebyshev = (a: Pos, b: Pos): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function neighbors4(board: Board, x: number, y: number): Tile[] {
  const out: Tile[] = [];
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of deltas) {
    const t = tileAt(board, x + dx, y + dy);
    if (t) out.push(t);
  }
  return out;
}

export function isRevealed(tile: Tile, playerId: number): boolean {
  return (tile.revealed & (1 << playerId)) !== 0;
}

export function reveal(board: Board, playerId: number, cx: number, cy: number, radius: number): number {
  let count = 0;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const t = tileAt(board, x, y);
      if (!t) continue;
      if (manhattan({ x, y }, { x: cx, y: cy }) > radius + 0.5) continue;
      const bit = 1 << playerId;
      if ((t.revealed & bit) === 0) {
        t.revealed |= bit;
        count++;
      }
    }
  }
  return count;
}

export function playerStructures(state: GameState, playerId: number): { tile: Tile; structure: Structure }[] {
  const out: { tile: Tile; structure: Structure }[] = [];
  for (const tile of state.tiles) {
    if (tile.structure && tile.structure.owner === playerId) out.push({ tile, structure: tile.structure });
  }
  return out;
}

export function playerSubstations(state: GameState, playerId: number): Tile[] {
  return state.tiles.filter((t) => t.structure?.kind === 'substation' && t.structure.owner === playerId);
}

/** Nearest owned substation within the connection radius, or null. */
export function attachedSubstation(state: GameState, tile: Tile, playerId: number, radius: number): Tile | null {
  let best: Tile | null = null;
  let bestDist = Infinity;
  for (const sub of playerSubstations(state, playerId)) {
    const d = manhattan(sub, tile);
    if (d <= radius && d < bestDist) {
      best = sub;
      bestDist = d;
    }
  }
  return best;
}

/** Average transmission cost multiplier for a straight corridor between two points. */
export function corridorCost(state: GameState, a: Pos, b: Pos): number {
  const steps = Math.max(1, Math.round(chebyshev(a, b) * 2));
  let total = 0;
  let samples = 0;
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / steps);
    const y = Math.round(a.y + ((b.y - a.y) * i) / steps);
    const t = tileAt(state, x, y);
    if (!t) continue;
    total += TERRAINS[t.terrain].lineCost;
    samples++;
  }
  return samples ? total / samples : 1;
}

