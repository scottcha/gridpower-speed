/** Art direction: the world's palette, kept in one place so the whole game stays cohesive. */
import type { Terrain } from '../engine/types';

export const TILE_W = 124;
export const TILE_H = 62;
export const ELEV_STEP = 13;

export interface TerrainPalette {
  top: [string, string];
  side: string;
  sideDark: string;
  detail: string;
  detailAlt: string;
}

export const TERRAIN_PALETTE: Record<Terrain, TerrainPalette> = {
  ocean: { top: ['#145a88', '#186a9b'], side: '#0b3654', sideDark: '#06263d', detail: '#3d8fbd', detailAlt: '#8fd8f2' },
  coast: { top: ['#dccb9a', '#e5d6a8'], side: '#ab9762', sideDark: '#827044', detail: '#f4e8c2', detailAlt: '#7fc9e6' },
  plains: { top: ['#4f9a4b', '#5aa954'], side: '#356f39', sideDark: '#26542b', detail: '#83c976', detailAlt: '#c8e59a' },
  forest: { top: ['#2e7847', '#37854f'], side: '#205332', sideDark: '#163e26', detail: '#5aa96c', detailAlt: '#2a6b41' },
  desert: { top: ['#cfa063', '#d9ae72'], side: '#9d7540', sideDark: '#78582e', detail: '#eccd95', detailAlt: '#b8854d' },
  mountain: { top: ['#828b99', '#8f98a6'], side: '#575e6a', sideDark: '#404650', detail: '#dbe4f0', detailAlt: '#6f7684' },
  river: { top: ['#4f9a4b', '#5aa954'], side: '#356f39', sideDark: '#26542b', detail: '#2f9bd8', detailAlt: '#8fe0f7' },
  geothermal: { top: ['#9e6c52', '#ad7a5e'], side: '#714735', sideDark: '#553326', detail: '#d9926a', detailAlt: '#f0b48a' },
  urban: { top: ['#7e8796', '#8a93a3'], side: '#585f6c', sideDark: '#414751', detail: '#c3ccda', detailAlt: '#6b7384' },
  basin: { top: ['#a79c62', '#b3a870'], side: '#7c7341', sideDark: '#5d5630', detail: '#d8cd93', detailAlt: '#8f8552' },
};

export const WATER = {
  deep: '#0f3f63',
  mid: '#175a86',
  shallow: '#1f77a5',
  foam: '#a9e6f7',
};

export const PLAYER_TINTS: { color: string; accent: string; glow: string }[] = [
  { color: '#3fd8c2', accent: '#a6fff1', glow: 'rgba(63,216,194,0.55)' },
  { color: '#f5a524', accent: '#ffd479', glow: 'rgba(245,165,36,0.5)' },
  { color: '#ff5d8f', accent: '#ff9ebb', glow: 'rgba(255,93,143,0.5)' },
  { color: '#8f7bff', accent: '#c0b4ff', glow: 'rgba(143,123,255,0.5)' },
];

export const NEUTRAL_TINT = { color: '#8a97a8', accent: '#c2ccdb', glow: 'rgba(138,151,168,0.4)' };

export const INK = {
  panel: 'rgba(9, 16, 25, 0.86)',
  line: 'rgba(126, 190, 230, 0.14)',
  text: '#e7f1f8',
  dim: '#8fa4b6',
};

export const STRUCTURE_ACCENTS: Partial<Record<string, string>> = {
  solar: '#5fb0ff',
  wind: '#9fe0ff',
  gas: '#ffb35c',
  hydro: '#5fd3ff',
  nuclear: '#b7f0c9',
  geothermal: '#ff9b6a',
  battery: '#8ef0c2',
  substation: '#a9c7e8',
  edge: '#7fe6ff',
  hyperscale: '#8fd0ff',
  gigafactory: '#c6a9ff',
  lab: '#d3b4ff',
};

export function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
