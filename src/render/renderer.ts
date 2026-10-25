/**
 * Isometric canvas renderer. Pure presentation: it reads GameState and never
 * mutates it. Ground and structures are drawn back-to-front in depth order;
 * overlays reuse the engine's dispatch telemetry.
 */
import { BALANCE, STRUCTURES, TERRAINS } from '../engine/config';
import { lineCapacity, techMods } from '../engine/progression';
import { attachedSubstation, playerSubstations } from '../engine/board';
import type { GameState, PlayerTurnReport, Pos, StructureKind, Tile } from '../engine/types';
import { drawStructure } from './art';
import { ELEV_STEP, PLAYER_TINTS, TERRAIN_PALETTE, TILE_H, TILE_W, WATER, withAlpha } from './palette';

export type Overlay = 'none' | 'power' | 'compute' | 'territory' | 'economy';

export interface CameraState {
  cx: number;
  cy: number;
  zoom: number;
}

export interface RendererBridge {
  getState(): GameState | null;
  getPlayerId(): number;
  getSelection(): Pos | null;
  getOverlay(): Overlay;
  getBuildKind(): StructureKind | null;
  getLinkSource(): Pos | null;
  getPreview(): PlayerTurnReport | null;
  onTileClick(pos: Pos, mods: { shift: boolean }): void;
  onHover(pos: Pos | null, screen: { x: number; y: number } | null): void;
  onCamera(cam: CameraState): void;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export class GridRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bridge: RendererBridge;
  private cam: CameraState = { cx: 0, cy: 0, zoom: 0.85 };
  private targetCam: CameraState | null = null;
  private hover: Pos | null = null;
  private preview: PlayerTurnReport | null = null;
  private raf = 0;
  private start = performance.now();
  private dragging = false;
  private moved = false;
  private lastPointer = { x: 0, y: 0 };
  private order: Tile[] = [];
  private orderRev = -1;
  private particles: { x: number; y: number; vx: number; vy: number; life: number; size: number }[] = [];
  private particleWeather = '';
  private buildEffects: { x: number; y: number; start: number }[] = [];
  private knownStructures = new Set<string>();
  private knownLinks = new Set<string>();
  private effectRev = -1;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private vignette: CanvasGradient | null = null;
  private detachFns: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, bridge: RendererBridge) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    this.bridge = bridge;
    this.resize();
    this.bindEvents();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setPreview(report: PlayerTurnReport | null): void {
    this.preview = report;
  }

  focusTile(x: number, y: number, immediate = false): void {
    const cam = this.tileCamera(x, y);
    if (immediate) {
      this.cam = cam;
      this.targetCam = null;
      this.bridge.onCamera(this.cam);
    } else {
      this.targetCam = cam;
    }
  }

  panBy(dx: number, dy: number): void {
    this.targetCam = null;
    this.cam.cx -= dx / this.cam.zoom;
    this.cam.cy -= dy / this.cam.zoom;
    this.clampCamera();
    this.bridge.onCamera(this.cam);
  }

  zoomBy(factor: number): void {
    this.cam.zoom = clamp(this.cam.zoom * factor, 0.5, 1.9);
    this.clampCamera();
    this.bridge.onCamera(this.cam);
  }

  getCamera(): CameraState {
    return { ...this.cam };
  }

  setZoom(zoom: number): void {
    this.cam.zoom = clamp(zoom, 0.5, 1.9);
    this.targetCam = null;
    this.clampCamera();
    this.bridge.onCamera(this.cam);
  }

  screenToTile(px: number, py: number): Pos | null {
    const state = this.bridge.getState();
    if (!state) return null;
    const wx = (px - this.width / 2) / this.cam.zoom + this.cam.cx;
    const wy = (py - this.height / 2) / this.cam.zoom + this.cam.cy;
    // project() shifts the map so its centre sits on the origin; undo that here.
    const offset = (state.size * TILE_H) / 2 - TILE_H / 2;
    const wyWorld = wy + offset;
    const approxX = Math.round(wyWorld / TILE_H + wx / TILE_W);
    const approxY = Math.round(wyWorld / TILE_H - wx / TILE_W);
    let best: Pos | null = null;
    let bestDist = Infinity;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = approxX + dx;
        const y = approxY + dy;
        if (x < 0 || y < 0 || x >= state.size || y >= state.size) continue;
        const p = this.project(x, y, state);
        const dd = Math.abs(px - p.x) / (TILE_W / 2) + Math.abs(py - p.y) / (TILE_H / 2);
        if (dd <= 1.05 && dd < bestDist) {
          bestDist = dd;
          best = { x, y };
        }
      }
    }
    return best;
  }

  tileScreen(x: number, y: number): { x: number; y: number } | null {
    const state = this.bridge.getState();
    if (!state) return null;
    return this.project(x, y, state);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const fn of this.detachFns) fn();
  }

  // -------------------------------------------------------------------------

  private tileCamera(x: number, y: number): CameraState {
    const wx = (x - y) * (TILE_W / 2);
    const wy = (x + y) * (TILE_H / 2) - (this.bridge.getState()?.size ?? 0) * (TILE_H / 2) + TILE_H / 2;
    return { cx: wx, cy: wy, zoom: this.cam.zoom };
  }

  private project(x: number, y: number, state: GameState): { x: number; y: number } {
    const wx = (x - y) * (TILE_W / 2);
    const wy = (x + y) * (TILE_H / 2) - state.size * (TILE_H / 2) + TILE_H / 2;
    const elev = -state.tiles[y * state.size + x].elevation * ELEV_STEP;
    return {
      x: this.width / 2 + (wx - this.cam.cx) * this.cam.zoom,
      y: this.height / 2 + (wy + elev - this.cam.cy) * this.cam.zoom,
    };
  }

  private clampCamera(): void {
    const state = this.bridge.getState();
    const size = state?.size ?? 16;
    const maxX = size * TILE_W * 0.55;
    const maxY = size * TILE_H * 0.85 + 120;
    this.cam.cx = clamp(this.cam.cx, -maxX, maxX);
    this.cam.cy = clamp(this.cam.cy, -maxY, maxY);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(320, rect.width);
    this.height = Math.max(320, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.vignette = null;
  }

  private bindEvents(): void {
    const onResize = () => {
      this.resize();
      this.particles = [];
    };
    window.addEventListener('resize', onResize);
    this.detachFns.push(() => window.removeEventListener('resize', onResize));

    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      this.dragging = true;
      this.moved = false;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const px = e.clientX - this.canvas.getBoundingClientRect().left;
      const py = e.clientY - this.canvas.getBoundingClientRect().top;
      if (this.dragging) {
        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) this.moved = true;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        if (this.moved) {
          this.targetCam = null;
          this.cam.cx -= dx / this.cam.zoom;
          this.cam.cy -= dy / this.cam.zoom;
          this.clampCamera();
          this.bridge.onCamera(this.cam);
        }
        return;
      }
      const tile = this.screenToTile(px, py);
      const changed = !tile !== !this.hover || (tile && this.hover && (tile.x !== this.hover.x || tile.y !== this.hover.y));
      this.hover = tile;
      if (changed) this.bridge.onHover(tile, tile ? { x: px, y: py } : null);
      this.canvas.style.cursor = tile ? 'pointer' : 'default';
    };
    const up = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      if (this.moved) return;
      const rect = this.canvas.getBoundingClientRect();
      const tile = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
      if (tile) this.bridge.onTileClick(tile, { shift: e.shiftKey });
    };
    const leave = () => {
      if (this.hover) {
        this.hover = null;
        this.bridge.onHover(null, null);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const before = this.screenToWorld(px, py);
      const factor = Math.exp(-e.deltaY * 0.0014);
      this.cam.zoom = clamp(this.cam.zoom * factor, 0.5, 1.9);
      const after = this.screenToWorld(px, py);
      this.cam.cx += before.x - after.x;
      this.cam.cy += before.y - after.y;
      this.targetCam = null;
      this.clampCamera();
      this.bridge.onCamera(this.cam);
    };
    const menu = (e: Event) => e.preventDefault();

    this.canvas.addEventListener('pointerdown', down);
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointerleave', leave);
    this.canvas.addEventListener('wheel', wheel, { passive: false });
    this.canvas.addEventListener('contextmenu', menu);
    this.detachFns.push(() => {
      this.canvas.removeEventListener('pointerdown', down);
      this.canvas.removeEventListener('pointermove', move);
      this.canvas.removeEventListener('pointerup', up);
      this.canvas.removeEventListener('pointerleave', leave);
      this.canvas.removeEventListener('wheel', wheel);
      this.canvas.removeEventListener('contextmenu', menu);
    });
  }

  private screenToWorld(px: number, py: number): { x: number; y: number } {
    return {
      x: (px - this.width / 2) / this.cam.zoom + this.cam.cx,
      y: (py - this.height / 2) / this.cam.zoom + this.cam.cy,
    };
  }

  private loop(now: number): void {
    const t = (now - this.start) / 1000;
    this.preview = this.bridge.getPreview();
    const state = this.bridge.getState();
    if (this.targetCam) {
      this.cam.cx += (this.targetCam.cx - this.cam.cx) * 0.14;
      this.cam.cy += (this.targetCam.cy - this.cam.cy) * 0.14;
      this.cam.zoom += (this.targetCam.zoom - this.cam.zoom) * 0.14;
      if (Math.abs(this.targetCam.cx - this.cam.cx) < 0.5 && Math.abs(this.targetCam.cy - this.cam.cy) < 0.5) {
        this.cam = { ...this.targetCam };
        this.targetCam = null;
      }
      this.bridge.onCamera(this.cam);
    }
    this.draw(state, t);
    this.raf = requestAnimationFrame(this.loop);
  }

  private draw(state: GameState | null, time: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#060b12';
    ctx.fillRect(0, 0, this.width, this.height);
    if (!state) {
      ctx.restore();
      return;
    }
    if (!this.order.length || this.orderRev !== state.seed + state.size) {
      this.order = [...state.tiles].sort((a, b) => a.x + a.y - (b.x + b.y) || a.y - b.y);
      this.orderRev = state.seed + state.size;
    }
    const playerId = this.bridge.getPlayerId();
    if (state.revision !== this.effectRev) {
      this.effectRev = state.revision;
      const now = time;
      for (const tile of state.tiles) {
        if (!tile.structure) continue;
        const key = `${tile.x},${tile.y}`;
        if (!this.knownStructures.has(key) && (tile.revealed & (1 << playerId)) !== 0) {
          this.buildEffects.push({ x: tile.x, y: tile.y, start: now });
        }
        this.knownStructures.add(key);
      }
      for (const link of state.links) {
        const key = `${link.a.x},${link.a.y}-${link.b.x},${link.b.y}`;
        if (!this.knownLinks.has(key)) {
          const mx = (link.a.x + link.b.x) / 2;
          const my = (link.a.y + link.b.y) / 2;
          this.buildEffects.push({ x: mx, y: my, start: now });
        }
        this.knownLinks.add(key);
      }
    }
    this.buildEffects = this.buildEffects.filter((e) => time - e.start < 1.4);
    const overlay = this.bridge.getOverlay();
    const selection = this.bridge.getSelection();
    const buildKind = this.bridge.getBuildKind();
    const linkSource = this.bridge.getLinkSource();
    const zoom = this.cam.zoom;

    this.drawWaterBackdrop(time);

    // Ground
    for (const tile of this.order) {
      this.drawGround(state, tile, playerId, time);
    }
    // Rivers are continuous across tiles, so they are drawn in one pass above the ground.
    this.drawRivers(state, playerId, time);
    // Territory borders
    this.drawBorders(state, playerId, time);
    // Transmission corridors
    this.drawLinks(state, playerId, time);
    // Overlay tints sit on the ground, under the structures so buildings stay crisp.
    this.drawOverlay(state, playerId, overlay, time);
    // Structures
    for (const tile of this.order) {
      this.drawTileStructure(state, tile, playerId, time);
    }
    this.drawOverlayLabels(state, playerId, overlay, time);
    this.drawSelection(state, selection, time, zoom);
    this.drawLinkPreview(state, playerId, selection, linkSource, time);
    if (buildKind && this.hover) this.drawBuildGhost(state, playerId, this.hover, buildKind, time);
    else if (this.hover) this.drawHover(state, this.hover, time);
    this.drawBuildEffects(state, time);
    this.drawWeather(state, time, zoom);
    this.drawAtmosphere();
    this.drawVignette();
    ctx.restore();
  }

  private drawWaterBackdrop(time: number): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, '#071019');
    g.addColorStop(0.55, '#081520');
    g.addColorStop(1, '#050a10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
    // Deep water frame around the playable diamond, so the map does not float on a void.
    const state = this.bridge.getState();
    if (state) {
      const corners = [
        [-1.4, -1.4],
        [state.size + 0.4, -1.4],
        [state.size + 0.4, state.size + 0.4],
        [-1.4, state.size + 0.4],
      ];
      const pts = corners.map(([x, y]) => {
        const wx = (x - y) * (TILE_W / 2);
        const wy = (x + y) * (TILE_H / 2) - state.size * (TILE_H / 2) + TILE_H / 2;
        return { x: this.width / 2 + (wx - this.cam.cx) * this.cam.zoom, y: this.height / 2 + (wy - this.cam.cy) * this.cam.zoom };
      });
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 60 * this.cam.zoom;
      ctx.shadowOffsetY = 18 * this.cam.zoom;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const pt of pts.slice(1)) ctx.lineTo(pt.x, pt.y);
      ctx.closePath();
      const depth = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
      depth.addColorStop(0, '#0c324c');
      depth.addColorStop(1, '#071e2f');
      ctx.fillStyle = depth;
      ctx.fill();
      ctx.restore();
    }
    const glow = ctx.createRadialGradient(this.width / 2, this.height * 0.44, 40, this.width / 2, this.height * 0.44, Math.max(this.width, this.height) * 0.55);
    glow.addColorStop(0, 'rgba(46, 128, 168, 0.13)');
    glow.addColorStop(1, 'rgba(10, 24, 38, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);
    // Faint schematic grid behind the world.
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#6fd7ff';
    ctx.lineWidth = 1;
    const step = 64 * this.cam.zoom;
    const ox = ((-this.cam.cx * this.cam.zoom + this.width / 2) % step + step) % step;
    const oy = ((-this.cam.cy * this.cam.zoom + this.height / 2) % step + step) % step;
    for (let x = ox; x < this.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = oy; y < this.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
    ctx.restore();
    void time;
  }

  private diamond(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x - w, y);
    ctx.closePath();
  }

  private drawGround(state: GameState, tile: Tile, playerId: number, time: number): void {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const w = (TILE_W / 2) * zoom;
    const h = (TILE_H / 2) * zoom;
    const p = this.project(tile.x, tile.y, state);
    const revealed = (tile.revealed & (1 << playerId)) !== 0;
    // Unexplored land is shown as muted biome silhouettes: the shape of the world
    // is legible, but resources and detail stay hidden until surveyed.
    const displayTerrain: Tile['terrain'] = revealed
      ? tile.terrain
      : tile.terrain === 'geothermal' || tile.terrain === 'basin' || tile.terrain === 'urban' || tile.terrain === 'river'
        ? 'plains'
        : tile.terrain;
    if (displayTerrain === 'ocean') {
      this.drawOceanTile(state, tile, p.x, p.y, w, h, time);
      return;
    }
    const palette = TERRAIN_PALETTE[displayTerrain];
    const elev = tile.elevation * ELEV_STEP * zoom;
    const topY = p.y;
    const baseY = p.y + elev;

    // Cliffs toward lower neighbours draw behind the top face.
    for (const [dx, dy, side] of [
      [1, 0, 'right'],
      [0, 1, 'left'],
    ] as const) {
      const n = tile.x + dx < state.size && tile.y + dy < state.size ? state.tiles[(tile.y + dy) * state.size + (tile.x + dx)] : null;
      if (!n || (n.revealed & (1 << playerId)) === 0) continue;
      const diff = tile.elevation - n.elevation;
      if (diff <= 0) continue;
      const drop = diff * ELEV_STEP * zoom;
      ctx.beginPath();
      if (side === 'right') {
        ctx.moveTo(p.x + w, baseY);
        ctx.lineTo(p.x, baseY + h);
        ctx.lineTo(p.x, baseY + h + drop);
        ctx.lineTo(p.x + w, baseY + drop);
      } else {
        ctx.moveTo(p.x - w, baseY);
        ctx.lineTo(p.x, baseY + h);
        ctx.lineTo(p.x, baseY + h + drop);
        ctx.lineTo(p.x - w, baseY + drop);
      }
      ctx.closePath();
      ctx.fillStyle = side === 'right' ? palette.side : palette.sideDark;
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,18,26,0.28)';
      ctx.lineWidth = 1;
      for (let i = 1; i < diff + 2; i++) {
        ctx.beginPath();
        if (side === 'right') {
          ctx.moveTo(p.x + w, baseY + (drop / (diff + 1)) * i);
          ctx.lineTo(p.x, baseY + h + (drop / (diff + 1)) * i);
        } else {
          ctx.moveTo(p.x - w, baseY + (drop / (diff + 1)) * i);
          ctx.lineTo(p.x, baseY + h + (drop / (diff + 1)) * i);
        }
        ctx.stroke();
      }
    }

    // Top face
    const shade = palette.top[0];
    this.diamond(ctx, p.x, topY, w, h);
    ctx.fillStyle = shade;
    ctx.fill();
    // Soft light from the north-west.
    this.diamond(ctx, p.x - w * 0.06, topY - h * 0.06, w * 0.92, h * 0.9);
    ctx.fillStyle = tile.variant > 0.62 ? 'rgba(255, 248, 225, 0.035)' : 'rgba(6, 18, 28, 0.025)';
    ctx.fill();
    // Low-poly facets: warm light on the top-left, shadow on the bottom-right.
    ctx.beginPath();
    ctx.moveTo(p.x, topY - h);
    ctx.lineTo(p.x + w, topY);
    ctx.lineTo(p.x, topY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 246, 220, 0.05)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x, topY + h);
    ctx.lineTo(p.x - w, topY);
    ctx.lineTo(p.x, topY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 14, 22, 0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,16,24,0.2)';
    ctx.lineWidth = 1;
    this.diamond(ctx, p.x, topY, w, h);
    ctx.stroke();

    const detail = Math.max(0.8, zoom * 1.4);
    switch (displayTerrain) {
      case 'coast': {
        const touches = this.neighborTerrain(state, tile, 'ocean', playerId);
        if (touches) {
          ctx.strokeStyle = withAlpha(WATER.foam, 0.75);
          ctx.lineWidth = Math.max(1.2, 2.2 * zoom);
          const edge = this.edgeForDirection(touches);
          ctx.beginPath();
          ctx.moveTo(p.x + edge.a.x * w, topY + edge.a.y * h);
          ctx.lineTo(p.x + edge.b.x * w, topY + edge.b.y * h);
          ctx.stroke();
        }
        ctx.fillStyle = withAlpha(palette.detail, 0.6);
        for (let i = 0; i < 3; i++) {
          const hx = hash01(tile.x * 13 + i * 7 + tile.y);
          const hy = hash01(tile.x * 5 + tile.y * 11 + i);
          ctx.beginPath();
          ctx.arc(p.x + (hx - 0.5) * w * 1.2, topY + (hy - 0.5) * h * 1.2, 0.9 * detail, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'plains': {
        ctx.strokeStyle = withAlpha(palette.detail, 0.9);
        ctx.lineWidth = Math.max(0.7, 1.1 * zoom);
        for (let i = 0; i < 6; i++) {
          const hx = hash01(tile.x * 17 + i * 31 + tile.y * 7);
          const hy = hash01(tile.x * 3 + tile.y * 19 + i * 13);
          const gx = p.x + (hx - 0.5) * w * 1.3;
          const gy = topY + (hy - 0.5) * h * 1.3;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx - 1.4 * detail, gy - 3 * detail);
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + 1.6 * detail, gy - 2.4 * detail);
          ctx.stroke();
        }
        if (tile.variant > 0.82) {
          ctx.fillStyle = '#ffe9a3';
          ctx.beginPath();
          ctx.arc(p.x + (tile.variant - 0.9) * w * 3, topY + h * 0.15, 1.3 * detail, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'forest': {
        const trees = 3 + Math.floor(tile.variant * 3);
        for (let i = 0; i < trees; i++) {
          const hx = hash01(tile.x * 23 + i * 11 + tile.y * 5);
          const hy = hash01(tile.x * 7 + tile.y * 29 + i * 3);
          const tx = p.x + (hx - 0.5) * w * 1.35;
          const ty = topY + (hy - 0.5) * h * 1.15;
          const size = (9 + hash01(i + tile.x * 3 + tile.y) * 6) * detail;
          ctx.fillStyle = 'rgba(10,30,20,0.32)';
          ctx.beginPath();
          ctx.ellipse(tx, ty + 1.5 * detail, size * 0.55, size * 0.24, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#5a3f2a';
          ctx.fillRect(tx - 0.8 * detail, ty - size * 0.5, 1.6 * detail, size * 0.55);
          const g = ctx.createLinearGradient(tx - size, ty - size * 2, tx + size, ty);
          g.addColorStop(0, palette.detail);
          g.addColorStop(1, '#1e5a3a');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(tx, ty - size * 2.1);
          ctx.lineTo(tx + size * 0.72, ty - size * 0.55);
          ctx.lineTo(tx - size * 0.72, ty - size * 0.55);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(tx, ty - size * 2.6);
          ctx.lineTo(tx + size * 0.55, ty - size * 1.3);
          ctx.lineTo(tx - size * 0.55, ty - size * 1.3);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'desert': {
        ctx.strokeStyle = withAlpha(palette.detailAlt, 0.65);
        ctx.lineWidth = 1 * zoom;
        for (let i = 0; i < 4; i++) {
          const hx = hash01(tile.x * 13 + i * 19 + tile.y);
          const hy = hash01(tile.x + tile.y * 23 + i * 5);
          const dx = p.x + (hx - 0.5) * w;
          const dy = topY + (hy - 0.5) * h;
          ctx.beginPath();
          ctx.arc(dx, dy, (3.5 + hx * 3) * detail, Math.PI * 1.05, Math.PI * 1.95);
          ctx.stroke();
        }
        if (tile.variant > 0.6) {
          ctx.fillStyle = 'rgba(120, 170, 90, 0.85)';
          const cx = p.x + (tile.variant - 0.5) * w;
          const cy = topY + h * 0.2;
          ctx.fillRect(cx - 1.2 * detail, cy - 5 * detail, 2.4 * detail, 5 * detail);
          ctx.fillRect(cx - 4 * detail, cy - 5 * detail, 8 * detail, 2 * detail);
        }
        break;
      }
      case 'mountain': {
        const peakH = (34 + tile.variant * 26) * detail;
        const halfW = w * 0.72;
        const peakX = p.x - w * 0.06 + (tile.variant - 0.5) * w * 0.18;
        const baseY = topY + h * 0.26;
        if (tile.variant < 0.34) {
          // lower, rounded foothill to break up a range of identical cones
          ctx.fillStyle = 'rgba(10,18,26,0.18)';
          ctx.beginPath();
          ctx.ellipse(p.x, topY + h * 0.2, halfW * 0.7, h * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(p.x - halfW * 0.75, topY + h * 0.25);
          ctx.quadraticCurveTo(p.x - w * 0.18, topY - peakH * 0.55, p.x + w * 0.04, topY - peakH * 0.42);
          ctx.quadraticCurveTo(p.x + w * 0.3, topY - peakH * 0.3, p.x + halfW * 0.7, topY + h * 0.3);
          ctx.closePath();
          const hill = ctx.createLinearGradient(p.x - halfW, topY - peakH * 0.5, p.x + halfW, topY);
          hill.addColorStop(0, '#97a1b0');
          hill.addColorStop(1, '#5d6674');
          ctx.fillStyle = hill;
          ctx.fill();
          ctx.strokeStyle = 'rgba(40,48,58,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x - w * 0.22, topY - peakH * 0.28);
          ctx.lineTo(p.x + w * 0.24, topY - peakH * 0.12);
          ctx.stroke();
          break;
        }
        // shadow at the base
        ctx.fillStyle = 'rgba(10, 18, 26, 0.22)';
        ctx.beginPath();
        ctx.ellipse(p.x, topY + h * 0.34, halfW * 0.8, h * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        // lit left face
        ctx.beginPath();
        ctx.moveTo(peakX - halfW, baseY);
        ctx.lineTo(peakX, baseY - peakH);
        ctx.lineTo(peakX + halfW * 0.15, baseY);
        ctx.closePath();
        const lit = ctx.createLinearGradient(peakX - halfW, baseY - peakH, peakX, baseY);
        lit.addColorStop(0, '#c3ccda');
        lit.addColorStop(1, '#7d8797');
        ctx.fillStyle = lit;
        ctx.fill();
        // shaded right face
        ctx.beginPath();
        ctx.moveTo(peakX, baseY - peakH);
        ctx.lineTo(peakX + halfW, baseY + h * 0.04);
        ctx.lineTo(peakX + halfW * 0.15, baseY);
        ctx.closePath();
        ctx.fillStyle = '#5f6877';
        ctx.fill();
        // snow cap
        ctx.beginPath();
        ctx.moveTo(peakX, baseY - peakH);
        ctx.lineTo(peakX - halfW * 0.26, baseY - peakH * 0.62);
        ctx.lineTo(peakX - halfW * 0.1, baseY - peakH * 0.7);
        ctx.lineTo(peakX + halfW * 0.06, baseY - peakH * 0.58);
        ctx.lineTo(peakX + halfW * 0.28, baseY - peakH * 0.66);
        ctx.closePath();
        ctx.fillStyle = revealed ? '#f4f8fd' : '#6d7a8a';
        ctx.fill();
        if (revealed) {
          ctx.strokeStyle = 'rgba(60, 70, 84, 0.35)';
          ctx.lineWidth = 0.9;
          for (let i = 1; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(peakX - halfW * (0.4 - i * 0.08), baseY - peakH * (0.18 + i * 0.12));
            ctx.lineTo(peakX + halfW * (0.1 + i * 0.1), baseY - peakH * (0.14 + i * 0.12));
            ctx.stroke();
          }
        }
        break;
      }
      case 'river': {
        if (!revealed) break;
        ctx.fillStyle = 'rgba(120, 170, 120, 0.25)';
        for (let i = 0; i < 3; i++) {
          const hx = hash01(tile.x * 19 + i * 11 + tile.y);
          const hy = hash01(tile.x * 7 + tile.y * 23 + i);
          ctx.beginPath();
          ctx.arc(p.x + (hx - 0.5) * w * 0.8, topY + (hy - 0.5) * h * 0.7, 1.4 * zoom, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'geothermal': {
        if (!revealed) break;
        ctx.strokeStyle = 'rgba(70,40,30,0.55)';
        ctx.lineWidth = 1 * zoom;
        for (let i = 0; i < 3; i++) {
          const hx = hash01(tile.x * 11 + i * 7 + tile.y);
          const hy = hash01(tile.x * 3 + tile.y * 7 + i);
          ctx.beginPath();
          ctx.moveTo(p.x + (hx - 0.5) * w, topY + (hy - 0.5) * h);
          ctx.lineTo(p.x + (hx - 0.5) * w + 8 * zoom, topY + (hy - 0.5) * h + 4 * zoom);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(255,150,90,${0.25 + 0.2 * Math.sin(time * 2 + tile.x)})`;
        ctx.beginPath();
        ctx.ellipse(p.x, topY + h * 0.1, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'urban': {
        if (!revealed) break;
        ctx.strokeStyle = 'rgba(40,46,55,0.35)';
        ctx.lineWidth = 3 * zoom;
        ctx.beginPath();
        ctx.moveTo(p.x - w, topY);
        ctx.lineTo(p.x, topY + h);
        ctx.moveTo(p.x, topY - h);
        ctx.lineTo(p.x + w, topY);
        ctx.stroke();
        if (!tile.structure) {
          for (let i = 0; i < 3; i++) {
            const hx = hash01(tile.x * 29 + i * 13 + tile.y);
            const hy = hash01(tile.x * 5 + tile.y * 31 + i * 7);
            const bx = p.x + (hx - 0.5) * w * 0.95;
            const by = topY + (hy - 0.5) * h * 0.9;
            const bw = (12 + hash01(i + tile.x) * 7) * zoom;
            const bh = (10 + hash01(i + tile.y * 3) * 12) * zoom;
            ctx.fillStyle = 'rgba(10,16,24,0.3)';
            ctx.beginPath();
            ctx.ellipse(bx, by + 2 * zoom, bw * 0.7, bh * 0.22, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#8f9aa9';
            ctx.beginPath();
            ctx.moveTo(bx, by - bh);
            ctx.lineTo(bx + bw * 0.62, by - bh + bw * 0.3);
            ctx.lineTo(bx + bw * 0.62, by + bw * 0.3);
            ctx.lineTo(bx, by);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#5f6875';
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx - bw * 0.5, by - bw * 0.26);
            ctx.lineTo(bx - bw * 0.5, by + bh - bw * 0.26);
            ctx.lineTo(bx, by + bh);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#aeb9c7';
            ctx.beginPath();
            ctx.moveTo(bx, by - bh);
            ctx.lineTo(bx + bw * 0.62, by - bh + bw * 0.3);
            ctx.lineTo(bx, by - bh + bw * 0.6);
            ctx.lineTo(bx - bw * 0.5, by - bh + bw * 0.3);
            ctx.closePath();
            ctx.fill();
            for (let win = 0; win < 3; win++) {
              ctx.fillStyle = hash01(tile.x + i * 7 + win) > 0.4 ? 'rgba(255,220,140,0.85)' : 'rgba(30,40,52,0.8)';
              ctx.fillRect(bx + bw * 0.12, by - bh + bw * 0.42 + win * 2.4 * zoom, 1.6 * zoom, 1.2 * zoom);
            }
          }
        }
        break;
      }
      case 'basin': {
        if (!revealed) break;
        ctx.strokeStyle = 'rgba(70,60,30,0.4)';
        ctx.lineWidth = 1 * zoom;
        ctx.beginPath();
        ctx.moveTo(p.x - w * 0.7, topY + h * 0.1);
        ctx.lineTo(p.x, topY - h * 0.35);
        ctx.lineTo(p.x + w * 0.7, topY + h * 0.1);
        ctx.stroke();
        ctx.fillStyle = '#8b7d3f';
        ctx.beginPath();
        ctx.arc(p.x, topY - h * 0.2, 2 * zoom, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default:
        break;
    }
    if (!revealed && displayTerrain !== 'mountain') {
      this.diamond(ctx, p.x, topY, w, h);
      ctx.fillStyle = 'rgba(16, 34, 52, 0.68)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(130, 185, 220, 0.26)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3 * zoom, 5 * zoom]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = '#9fd6ff';
      ctx.lineWidth = 0.8;
      for (let i = -1; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(p.x - w * 0.55 + i * w * 0.4, topY + h * 0.5);
        ctx.lineTo(p.x + w * 0.1 + i * w * 0.4, topY - h * 0.5);
        ctx.stroke();
      }
      ctx.restore();
      if (hash01(tile.x * 31 + tile.y * 17) > 0.72) {
        ctx.fillStyle = 'rgba(160, 205, 235, 0.18)';
        ctx.beginPath();
        ctx.arc(p.x + (hash01(tile.x * 7 + tile.y) - 0.5) * w, topY + (hash01(tile.x + tile.y * 13) - 0.5) * h, 1.3 * zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawOceanTile(
    state: GameState,
    tile: Tile,
    x: number,
    y: number,
    w: number,
    h: number,
    time: number,
  ): void {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    let shallow = false;
    for (let dy = -2; dy <= 2 && !shallow; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (nx < 0 || ny < 0 || nx >= state.size || ny >= state.size) continue;
        const n = state.tiles[ny * state.size + nx];
        if (n.terrain !== 'ocean') {
          shallow = true;
          break;
        }
      }
    }
    this.diamond(ctx, x, y, w, h);
    ctx.fillStyle = shallow ? WATER.shallow : WATER.mid;
    ctx.fill();
    // Subtle depth and current.
    const wave = Math.sin(time * 1.1 + (tile.x * 1.7 + tile.y * 2.3)) * 2.2 * zoom;
    ctx.strokeStyle = withAlpha(WATER.foam, shallow ? 0.24 : 0.12);
    ctx.lineWidth = Math.max(0.7, 1 * zoom);
    for (let i = 0; i < (shallow ? 3 : 2); i++) {
      const wy = y - h * 0.28 + i * h * 0.34 + wave;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.42, wy);
      ctx.quadraticCurveTo(x, wy + h * 0.1, x + w * 0.42, wy);
      ctx.stroke();
    }
    if (shallow) {
      ctx.fillStyle = withAlpha(WATER.foam, 0.22);
      for (let i = 0; i < 3; i++) {
        const hx = hash01(tile.x * 17 + i * 5 + tile.y);
        const hy = hash01(tile.x * 3 + tile.y * 11 + i);
        ctx.beginPath();
        ctx.arc(x + (hx - 0.5) * w, y + (hy - 0.5) * h, 0.9 * zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      const nearLand = this.neighborTerrain(state, tile, 'land', -1);
      if (nearLand) {
        const edge = this.edgeForDirection(nearLand);
        ctx.strokeStyle = withAlpha(WATER.foam, 0.65);
        ctx.lineWidth = Math.max(1.2, 2 * zoom);
        ctx.beginPath();
        ctx.moveTo(x + edge.a.x * w, y + edge.a.y * h);
        ctx.lineTo(x + edge.b.x * w, y + edge.b.y * h);
        ctx.stroke();
      }
    }
  }

  private neighborTerrain(state: GameState, tile: Tile, kind: 'ocean' | 'land', playerId: number): 'up-left' | 'up-right' | 'down-left' | 'down-right' | null {
    const dirs: { dx: number; dy: number; name: 'up-left' | 'up-right' | 'down-left' | 'down-right' }[] = [
      { dx: -1, dy: 0, name: 'up-left' },
      { dx: 0, dy: -1, name: 'up-right' },
      { dx: 1, dy: 0, name: 'down-right' },
      { dx: 0, dy: 1, name: 'down-left' },
    ];
    for (const d of dirs) {
      const nx = tile.x + d.dx;
      const ny = tile.y + d.dy;
      if (nx < 0 || ny < 0 || nx >= state.size || ny >= state.size) continue;
      const n = state.tiles[ny * state.size + nx];
      if (playerId >= 0 && (n.revealed & (1 << playerId)) === 0) continue;
      const isOcean = n.terrain === 'ocean';
      if (kind === 'ocean' && isOcean) return d.name;
      if (kind === 'land' && !isOcean) return d.name;
    }
    return null;
  }

  private edgeForDirection(dir: 'up-left' | 'up-right' | 'down-left' | 'down-right'): { a: { x: number; y: number }; b: { x: number; y: number } } {
    switch (dir) {
      case 'up-left':
        return { a: { x: 0, y: -1 }, b: { x: -1, y: 0 } };
      case 'up-right':
        return { a: { x: 0, y: -1 }, b: { x: 1, y: 0 } };
      case 'down-left':
        return { a: { x: -1, y: 0 }, b: { x: 0, y: 1 } };
      default:
        return { a: { x: 1, y: 0 }, b: { x: 0, y: 1 } };
    }
  }

  private tileEdges(state: GameState, tile: Tile): { owner: number | null; a: { x: number; y: number }; b: { x: number; y: number } }[] {
    const out: { owner: number | null; a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
    const dirs: { dx: number; dy: number; edge: { a: { x: number; y: number }; b: { x: number; y: number } } }[] = [
      { dx: -1, dy: 0, edge: { a: { x: 0, y: -1 }, b: { x: -1, y: 0 } } },
      { dx: 0, dy: -1, edge: { a: { x: 0, y: -1 }, b: { x: 1, y: 0 } } },
      { dx: 1, dy: 0, edge: { a: { x: 1, y: 0 }, b: { x: 0, y: 1 } } },
      { dx: 0, dy: 1, edge: { a: { x: -1, y: 0 }, b: { x: 0, y: 1 } } },
    ];
    for (const d of dirs) {
      const nx = tile.x + d.dx;
      const ny = tile.y + d.dy;
      const n = nx >= 0 && ny >= 0 && nx < state.size && ny < state.size ? state.tiles[ny * state.size + nx] : null;
      if (!n || n.owner !== tile.owner) out.push({ owner: n ? n.owner : null, ...d.edge });
    }
    return out;
  }

  private drawRivers(state: GameState, playerId: number, time: number): void {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const w = (TILE_W / 2) * zoom;
    const h = (TILE_H / 2) * zoom;
    const segments: { ax: number; ay: number; bx: number; by: number }[] = [];
    for (const tile of state.tiles) {
      if (tile.terrain !== 'river') continue;
      if ((tile.revealed & (1 << playerId)) === 0) continue;
      const a = this.project(tile.x, tile.y, state);
      const dirs = [
        [1, 0],
        [0, 1],
      ];
      for (const [dx, dy] of dirs) {
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        const n = nx >= 0 && ny >= 0 && nx < state.size && ny < state.size ? state.tiles[ny * state.size + nx] : null;
        if (!n || (n.terrain !== 'river' && n.terrain !== 'ocean')) continue;
        if ((n.revealed & (1 << playerId)) === 0) continue;
        const b = this.project(nx, ny, state);
        segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      }
      // Stubs toward the sea read as an estuary.
      for (const [dx, dy] of [[-1, 0], [0, -1]]) {
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        const n = nx >= 0 && ny >= 0 && nx < state.size && ny < state.size ? state.tiles[ny * state.size + nx] : null;
        if (!n || n.terrain !== 'ocean') continue;
        const b = this.project(nx, ny, state);
        segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      }
    }
    if (!segments.length) return;
    const stroke = (color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const seg of segments) {
        ctx.moveTo(seg.ax, seg.ay);
        ctx.lineTo(seg.bx, seg.by);
      }
      ctx.stroke();
    };
    stroke('rgba(20, 54, 42, 0.5)', 11 * zoom);
    stroke('#256a8e', 6.4 * zoom);
    ctx.save();
    ctx.strokeStyle = 'rgba(146, 226, 250, 0.16)';
    ctx.lineWidth = Math.max(1, 1.6 * zoom);
    ctx.setLineDash([6 * zoom, 18 * zoom]);
    ctx.lineDashOffset = -time * 12 * zoom;
    ctx.beginPath();
    for (const seg of segments) {
      ctx.moveTo(seg.ax, seg.ay);
      ctx.lineTo(seg.bx, seg.by);
    }
    ctx.stroke();
    ctx.restore();
    void w;
    void h;
  }

  private drawBorders(state: GameState, playerId: number, time: number): void {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    for (const tile of this.order) {
      if (tile.owner === null) continue;
      if ((tile.revealed & (1 << playerId)) === 0) continue;
      const tint = PLAYER_TINTS[tile.owner] ?? PLAYER_TINTS[0];
      const p = this.project(tile.x, tile.y, state);
      const w = (TILE_W / 2) * zoom;
      const h = (TILE_H / 2) * zoom;
      for (const edge of this.tileEdges(state, tile)) {
        ctx.beginPath();
        ctx.moveTo(p.x + edge.a.x * w, p.y + edge.a.y * h);
        ctx.lineTo(p.x + edge.b.x * w, p.y + edge.b.y * h);
        ctx.strokeStyle = withAlpha(tint.color, 0.22);
        ctx.lineWidth = Math.max(6, 10 * zoom);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x + edge.a.x * w, p.y + edge.a.y * h);
        ctx.lineTo(p.x + edge.b.x * w, p.y + edge.b.y * h);
        ctx.strokeStyle = withAlpha(tint.color, 0.95);
        ctx.lineWidth = Math.max(2.5, 4 * zoom);
        ctx.stroke();
        ctx.strokeStyle = withAlpha(tint.accent, 0.5 + 0.25 * Math.sin(time * 2 + tile.x));
        ctx.lineWidth = Math.max(1, 1.4 * zoom);
        ctx.stroke();
      }
    }
  }

  private substationScreen(state: GameState, x: number, y: number): { x: number; y: number } {
    return this.project(x, y, state);
  }

  private drawLinks(state: GameState, playerId: number, time: number): void {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    for (const link of state.links) {
      const tileA = state.tiles[link.a.y * state.size + link.a.x];
      const tileB = state.tiles[link.b.y * state.size + link.b.x];
      const visibleA = (tileA.revealed & (1 << playerId)) !== 0;
      const visibleB = (tileB.revealed & (1 << playerId)) !== 0;
      if (!visibleA && !visibleB) continue;
      const a = this.substationScreen(state, link.a.x, link.a.y);
      const b = this.substationScreen(state, link.b.x, link.b.y);
      const tint = PLAYER_TINTS[link.owner] ?? PLAYER_TINTS[0];
      const report = link.owner === playerId && this.preview ? this.preview : state.report[link.owner];
      const flow = report?.linkFlow?.[`${link.a.x},${link.a.y}-${link.b.x},${link.b.y}`] ?? 0;
      const cap = link.owner >= 0 ? lineCapacity(state.players[link.owner]) : 160;
      const load = Math.min(1, flow / cap);
      const color = flow <= 0.5 ? withAlpha(tint.color, 0.5) : load > 0.8 ? '#ffb35c' : '#7cf0c8';
      const sag = (18 + Math.hypot(b.x - a.x, b.y - a.y) * 0.06) * zoom;
      const ax = a.x;
      const ay = a.y - 22 * zoom;
      const bx = b.x;
      const by = b.y - 22 * zoom;
      // glow
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = color;
      ctx.lineWidth = 7 * zoom;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by);
      ctx.stroke();
      ctx.restore();
      // three conductors
      for (const off of [-3, 0, 3]) {
        ctx.strokeStyle = withAlpha(color, off === 0 ? 0.95 : 0.6);
        ctx.lineWidth = Math.max(0.9, 1.4 * zoom);
        ctx.beginPath();
        ctx.moveTo(ax + off * zoom, ay);
        ctx.quadraticCurveTo((ax + bx) / 2 + off * zoom, (ay + by) / 2 + sag, bx + off * zoom, by);
        ctx.stroke();
      }
      if (flow > 0.5) {
        ctx.save();
        ctx.strokeStyle = 'rgba(220, 255, 240, 0.9)';
        ctx.lineWidth = Math.max(1, 1.7 * zoom);
        ctx.setLineDash([5 * zoom, 16 * zoom]);
        ctx.lineDashOffset = -time * 34 * zoom;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by);
        ctx.stroke();
        ctx.restore();
      }
      // pylons
      const px = (ax + bx) / 2;
      const py = (ay + by) / 2 + sag * 0.75;
      ctx.strokeStyle = '#93a6b8';
      ctx.lineWidth = Math.max(0.8, 1.2 * zoom);
      ctx.beginPath();
      ctx.moveTo(px, py - 13 * zoom);
      ctx.lineTo(px - 5 * zoom, py + 6 * zoom);
      ctx.moveTo(px, py - 13 * zoom);
      ctx.lineTo(px + 5 * zoom, py + 6 * zoom);
      ctx.moveTo(px - 6 * zoom, py - 4 * zoom);
      ctx.lineTo(px + 6 * zoom, py - 4 * zoom);
      ctx.moveTo(px - 4 * zoom, py + 1 * zoom);
      ctx.lineTo(px + 4 * zoom, py + 1 * zoom);
      ctx.stroke();
    }
  }

  private drawTileStructure(state: GameState, tile: Tile, playerId: number, time: number): void {
    if (!tile.structure) return;
    if ((tile.revealed & (1 << playerId)) === 0) return;
    const st = tile.structure;
    const p = this.project(tile.x, tile.y, state);
    const zoom = this.cam.zoom;
    const owner = st.owner;
    const tint = owner >= 0 ? PLAYER_TINTS[owner] : { color: '#8a97a8', accent: '#c2ccdb', glow: 'rgba(138,151,168,0.4)' };
    const report = owner === playerId && this.preview ? this.preview : state.report[owner];
    const util = report?.dcUtil?.[`${tile.x},${tile.y}`] ?? 0;
    const connected =
      owner < 0 || owner !== playerId
        ? true
        : st.kind === 'substation' || attachedSubstation(state, tile, owner, BALANCE.attachRadius) !== null;
    drawStructure({
      ctx: this.ctx,
      x: p.x,
      y: p.y,
      scale: zoom,
      time,
      owner,
      color: owner >= 0 ? state.players[owner].color : tint.color,
      accent: owner >= 0 ? state.players[owner].accent : tint.accent,
      structure: st,
      tile,
      utilisation: util,
      connected,
    });
    // Compute badge for the player's own data centers.
    if (owner === playerId && zoom > 0.9 && STRUCTURES[st.kind].pue) {
      const def = STRUCTURES[st.kind];
      const cu = def.mw * (def.eff ?? 1) * techMods(state.players[owner]).compute * TERRAINS[tile.terrain].compute * (util || 0);
      const label = `${cu >= 10 ? cu.toFixed(0) : cu.toFixed(1)} CU`;
      this.ctx.font = `700 ${Math.round(9 * zoom + 3)}px Inter, system-ui, sans-serif`;
      const tw = this.ctx.measureText(label).width;
      const bx = p.x - tw / 2 - 3;
      const by = p.y - 46 * zoom;
      this.ctx.fillStyle = 'rgba(7,14,22,0.78)';
      this.ctx.beginPath();
      this.ctx.roundRect(bx, by, tw + 6, 14 * zoom, 4);
      this.ctx.fill();
      this.ctx.fillStyle = util > 0.95 ? '#9dffd0' : util > 0.5 ? '#ffe3a3' : '#ffb3a0';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(label, p.x, by + 7 * zoom);
      this.ctx.textBaseline = 'alphabetic';
    }
  }

  private drawOverlay(state: GameState, playerId: number, overlay: Overlay, time: number): void {
    if (overlay === 'none') return;
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const w = (TILE_W / 2) * zoom;
    const h = (TILE_H / 2) * zoom;
    for (const tile of this.order) {
      if ((tile.revealed & (1 << playerId)) === 0) continue;
      const p = this.project(tile.x, tile.y, state);
      if (overlay === 'territory') {
        if (tile.owner === null) continue;
        const tint = PLAYER_TINTS[tile.owner] ?? PLAYER_TINTS[0];
        this.diamond(ctx, p.x, p.y, w, h);
        ctx.fillStyle = withAlpha(tint.color, tile.owner === playerId ? 0.16 : 0.13);
        ctx.fill();
        continue;
      }
      if (overlay === 'economy') {
        const site = this.siteValue(tile);
        if (!site) continue;
        const pulse = 0.55 + 0.45 * Math.sin(time * 2.2 + tile.x * 0.6 + tile.y * 0.4);
        this.diamond(ctx, p.x, p.y, w, h);
        ctx.fillStyle = `rgba(255, 209, 102, ${0.08 + 0.12 * pulse})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 209, 102, ${0.4 + 0.3 * pulse})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        continue;
      }
      const report = this.preview;
      if (!report) continue;
      if (overlay === 'power') {
        const island = report.islands.find((isl) =>
          isl.substations.some((s) => Math.abs(s.x - tile.x) + Math.abs(s.y - tile.y) <= BALANCE.attachRadius),
        );
        if (!island) continue;
        const stability = island.stability;
        const color = stability >= 80 ? '#5df0b1' : stability >= 60 ? '#ffd166' : '#ff7a59';
        this.diamond(ctx, p.x, p.y, w, h);
        ctx.fillStyle = withAlpha(color, 0.12);
        ctx.fill();
        ctx.strokeStyle = withAlpha(color, 0.3);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (overlay === 'compute') {
        if (!tile.structure || !STRUCTURES[tile.structure.kind].pue) continue;
        const util = report.dcUtil[`${tile.x},${tile.y}`] ?? 0;
        const color = util > 0.95 ? '#5df0b1' : util > 0.5 ? '#ffd166' : '#ff7a59';
        this.diamond(ctx, p.x, p.y, w, h);
        ctx.fillStyle = withAlpha(color, 0.16);
        ctx.fill();
      }
    }
  }

  private drawOverlayLabels(state: GameState, playerId: number, overlay: Overlay, time: number): void {
    if (overlay !== 'compute' && overlay !== 'economy') return;
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    const report = this.preview;
    if (!report) return;
    ctx.save();
    ctx.textAlign = 'center';
    for (const tile of this.order) {
      if ((tile.revealed & (1 << playerId)) === 0) continue;
      const p = this.project(tile.x, tile.y, state);
      const h = (TILE_H / 2) * zoom;
      if (overlay === 'economy') {
        const site = this.siteValue(tile);
        if (!site) continue;
        const pulse = 0.65 + 0.35 * Math.sin(time * 2.2 + tile.x * 0.6 + tile.y * 0.4);
        ctx.font = `600 ${Math.round(10 * zoom + 4)}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = `rgba(255,229,160,${0.7 + 0.3 * pulse})`;
        ctx.fillText(site, p.x, p.y - h * 0.55);
        continue;
      }
      if (!tile.structure || !STRUCTURES[tile.structure.kind].pue) continue;
      const util = report.dcUtil[`${tile.x},${tile.y}`] ?? 0;
      const color = util > 0.95 ? '#5df0b1' : util > 0.5 ? '#ffd166' : '#ff7a59';
      ctx.font = `700 ${Math.round(10 * zoom + 4)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(`${Math.round(util * 100)}%`, p.x, p.y - h * 0.55);
    }
    ctx.restore();
  }

  private siteValue(tile: Tile): string | null {
    if (tile.structure) return null;
    if (tile.terrain === 'geothermal') return 'GEO';
    if (tile.terrain === 'river') return 'HYDRO';
    if (tile.terrain === 'basin') return 'GAS';
    if (tile.terrain === 'urban') return 'METRO';
    if (tile.terrain === 'mountain') return 'WIND';
    if (tile.terrain === 'desert') return 'SOLAR';
    return null;
  }

  private drawSelection(state: GameState, selection: Pos | null, time: number, zoom: number): void {
    if (!selection) return;
    const p = this.project(selection.x, selection.y, state);
    const w = (TILE_W / 2) * zoom;
    const h = (TILE_H / 2) * zoom;
    const pulse = 0.65 + 0.35 * Math.sin(time * 3);
    this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 + 0.3 * pulse})`;
    this.ctx.lineWidth = Math.max(1.4, 2.2 * zoom);
    this.diamond(this.ctx, p.x, p.y, w, h);
    this.ctx.stroke();
    this.ctx.strokeStyle = `rgba(159, 244, 255, ${0.5 * pulse})`;
    this.ctx.lineWidth = Math.max(1, 1.4 * zoom);
    this.diamond(this.ctx, p.x, p.y, w * 1.1, h * 1.1);
    this.ctx.stroke();
    // corner ticks
    this.ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    this.ctx.lineWidth = 2 * zoom;
    for (const [sx, sy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      this.ctx.beginPath();
      this.ctx.moveTo(p.x + sx * w * 1.12, p.y + sy * h * 1.12);
      this.ctx.lineTo(p.x + sx * w * 0.78, p.y + sy * h * 0.78);
      this.ctx.stroke();
    }
    const tile = state.tiles[selection.y * state.size + selection.x];
    if (tile.structure?.kind === 'substation' && tile.structure.owner >= 0) {
      this.ctx.setLineDash([6 * zoom, 8 * zoom]);
      this.ctx.strokeStyle = 'rgba(159, 244, 255, 0.18)';
      this.ctx.lineWidth = 1 * zoom;
      for (const t of state.tiles) {
        if (Math.abs(t.x - selection.x) + Math.abs(t.y - selection.y) > BALANCE.attachRadius) continue;
        const q = this.project(t.x, t.y, state);
        this.diamond(this.ctx, q.x, q.y, w, h);
        this.ctx.stroke();
      }
      this.ctx.setLineDash([]);
    }
  }

  private drawLinkPreview(state: GameState, playerId: number, selection: Pos | null, linkSource: Pos | null, time: number): void {
    if (!linkSource) return;
    const p = this.project(linkSource.x, linkSource.y, state);
    const w = (TILE_W / 2) * this.cam.zoom;
    const h = (TILE_H / 2) * this.cam.zoom;
    this.ctx.strokeStyle = `rgba(255, 209, 102, ${0.5 + 0.3 * Math.sin(time * 3)})`;
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([7, 7]);
    this.diamond(this.ctx, p.x, p.y, w * 1.1, h * 1.1);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    if (selection) {
      const q = this.project(selection.x, selection.y, state);
      this.ctx.strokeStyle = 'rgba(255, 209, 102, 0.6)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y - 20);
      this.ctx.lineTo(q.x, q.y - 20);
      this.ctx.stroke();
    }
    for (const sub of playerSubstations(state, playerId)) {
      if (sub.x === linkSource.x && sub.y === linkSource.y) continue;
      const q = this.project(sub.x, sub.y, state);
      this.ctx.strokeStyle = 'rgba(255,209,102,0.7)';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(q.x, q.y - 18 * this.cam.zoom, 9 * this.cam.zoom, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }

  private drawBuildGhost(state: GameState, playerId: number, hover: Pos, kind: StructureKind, time: number): void {
    const tile = state.tiles[hover.y * state.size + hover.x];
    const p = this.project(hover.x, hover.y, state);
    const zoom = this.cam.zoom;
    const w = (TILE_W / 2) * zoom;
    const h = (TILE_H / 2) * zoom;
    const player = state.players[playerId];
    const canBuildHere = tile.owner === playerId && !tile.structure && STRUCTURES[kind].terrains.includes(tile.terrain) && player.credits >= STRUCTURES[kind].cost;
    this.ctx.save();
    this.ctx.globalAlpha = 0.65;
    this.diamond(this.ctx, p.x, p.y, w, h);
    this.ctx.fillStyle = canBuildHere ? 'rgba(93,240,177,0.18)' : 'rgba(255,110,90,0.2)';
    this.ctx.fill();
    this.ctx.strokeStyle = canBuildHere ? 'rgba(93,240,177,0.9)' : 'rgba(255,110,90,0.9)';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    drawStructure({
      ctx: this.ctx,
      x: p.x,
      y: p.y,
      scale: zoom,
      time,
      owner: playerId,
      color: player.color,
      accent: player.accent,
      structure: { kind, owner: playerId, builtTurn: state.turn },
      tile,
      utilisation: 0,
      connected: true,
    });
    if (kind === 'substation') {
      this.ctx.setLineDash([5, 7]);
      this.ctx.strokeStyle = 'rgba(159,244,255,0.5)';
      this.ctx.lineWidth = 1;
      for (const t of state.tiles) {
        if (Math.abs(t.x - hover.x) + Math.abs(t.y - hover.y) > BALANCE.attachRadius) continue;
        const q = this.project(t.x, t.y, state);
        this.diamond(this.ctx, q.x, q.y, w, h);
        this.ctx.stroke();
      }
      this.ctx.setLineDash([]);
    }
    this.ctx.restore();
  }

  private drawHover(state: GameState, hover: Pos, time: number): void {
    const p = this.project(hover.x, hover.y, state);
    const zoom = this.cam.zoom;
    this.ctx.strokeStyle = `rgba(220, 245, 255, ${0.45 + 0.2 * Math.sin(time * 4)})`;
    this.ctx.lineWidth = 1.6 * zoom;
    this.diamond(this.ctx, p.x, p.y, (TILE_W / 2) * zoom, (TILE_H / 2) * zoom);
    this.ctx.stroke();
  }

  private drawWeather(state: GameState, time: number, zoom: number): void {
    const ctx = this.ctx;
    const id = state.weather.id;
    if (id === 'storm' || id === 'rain') {
      if (this.particleWeather !== id) {
        this.particleWeather = id;
        this.particles = Array.from({ length: id === 'storm' ? 190 : 120 }, () => ({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          vx: -2.4 - Math.random() * 2,
          vy: 10 + Math.random() * 9,
          life: 1,
          size: 6 + Math.random() * 10,
        }));
      }
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = 'rgba(28, 52, 78, 0.55)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(190, 225, 255, 0.55)';
      ctx.lineWidth = 1;
      for (const p of this.particles) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx, p.y + p.vy);
        ctx.stroke();
        p.x += p.vx * 0.9;
        p.y += p.vy * 0.9;
        if (p.y > this.height) {
          p.y = -10;
          p.x = Math.random() * this.width;
        }
        if (p.x < 0) p.x = this.width;
      }
      ctx.restore();
      return;
    }
    if (id === 'coldsnap') {
      if (this.particleWeather !== id) {
        this.particleWeather = id;
        this.particles = Array.from({ length: 110 }, () => ({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          vx: -0.5 + Math.random(),
          vy: 0.5 + Math.random() * 0.8,
          life: 1,
          size: 1.5 + Math.random() * 2.5,
        }));
      }
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = 'rgba(220, 240, 255, 0.75)';
      for (const p of this.particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        p.x += p.vx * 0.7;
        p.y += p.vy * 0.7;
        if (p.y > this.height) {
          p.y = -5;
          p.x = Math.random() * this.width;
        }
      }
      ctx.restore();
      return;
    }
    if (this.particleWeather !== id) {
      this.particleWeather = id;
      this.particles = [];
    }
    if (id === 'heatwave' || id === 'sunny') {
      const g = ctx.createLinearGradient(0, 0, 0, this.height);
      g.addColorStop(0, id === 'heatwave' ? 'rgba(255,140,60,0.10)' : 'rgba(255,220,140,0.05)');
      g.addColorStop(1, 'rgba(255,200,120,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (id === 'clearNight') {
      ctx.fillStyle = 'rgba(12, 24, 54, 0.32)';
      ctx.fillRect(0, 0, this.width, this.height);
    }
    void time;
    void zoom;
  }

  /** Warm key light from the north-west and a cool lift in the shadows. */
  private drawBuildEffects(state: GameState, time: number): void {
    const ctx = this.ctx;
    const zoom = this.cam.zoom;
    for (const effect of this.buildEffects) {
      const age = (time - effect.start) / 1.4;
      const p = this.project(Math.round(effect.x), Math.round(effect.y), state);
      const w = (TILE_W / 2) * zoom * (0.5 + age * 1.1);
      const h = (TILE_H / 2) * zoom * (0.5 + age * 1.1);
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.strokeStyle = 'rgba(160, 255, 232, 0.9)';
      ctx.lineWidth = Math.max(1, 2.4 * zoom * (1 - age));
      this.diamond(ctx, p.x, p.y, w, h);
      ctx.stroke();
      ctx.globalAlpha = (1 - age) * 0.6;
      ctx.strokeStyle = 'rgba(255, 220, 140, 0.8)';
      ctx.lineWidth = 1;
      const w2 = w * 1.35;
      const h2 = h * 1.35;
      this.diamond(ctx, p.x, p.y, w2, h2);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + age * 3;
        ctx.fillStyle = `rgba(190, 255, 240, ${(1 - age) * 0.8})`;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(angle) * w * 0.7, p.y + Math.sin(angle) * h * 0.7 - age * 18 * zoom, 1.8 * zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawAtmosphere(): void {
    const ctx = this.ctx;
    const light = ctx.createLinearGradient(0, 0, this.width, this.height);
    light.addColorStop(0, 'rgba(255, 214, 150, 0.05)');
    light.addColorStop(0.5, 'rgba(120, 190, 230, 0.015)');
    light.addColorStop(1, 'rgba(80, 130, 180, 0.06)');
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  private drawVignette(): void {
    const ctx = this.ctx;
    if (!this.vignette) {
      const g = ctx.createRadialGradient(this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.32, this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(2, 6, 12, 0.38)');
      this.vignette = g;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, this.width, this.height);
    // Darken the very top and bottom so the HUD reads cleanly.
    const top = ctx.createLinearGradient(0, 0, 0, 150);
    top.addColorStop(0, 'rgba(4,9,15,0.62)');
    top.addColorStop(1, 'rgba(4,9,15,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, this.width, 150);
    const bottom = ctx.createLinearGradient(0, this.height - 170, 0, this.height);
    bottom.addColorStop(0, 'rgba(4,9,15,0)');
    bottom.addColorStop(1, 'rgba(4,9,15,0.78)');
    ctx.fillStyle = bottom;
    ctx.fillRect(0, this.height - 170, this.width, 170);
  }
}

/** Small map for navigation; drawn on its own canvas. */
export function drawMinimap(
  canvas: HTMLCanvasElement,
  state: GameState,
  playerId: number,
  camera: CameraState,
  hover: Pos | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cellW = w / state.size;
  const cellH = h / state.size;
  for (const tile of state.tiles) {
    const seen = (tile.revealed & (1 << playerId)) !== 0;
    const palette = TERRAIN_PALETTE[tile.terrain];
    ctx.globalAlpha = seen ? 1 : tile.terrain === 'ocean' ? 0.55 : 0.34;
    ctx.fillStyle = palette.top[tile.variant > 0.5 ? 1 : 0];
    ctx.fillRect(tile.x * cellW, tile.y * cellH, cellW + 0.5, cellH + 0.5);
    ctx.globalAlpha = 1;
    if (tile.structure && seen) {
      const owner = tile.structure.owner;
      ctx.fillStyle = owner >= 0 ? state.players[owner].color : '#9aa7b6';
      const pad = tile.structure.kind === 'substation' ? 0.4 : 1.2;
      ctx.fillRect(tile.x * cellW + pad, tile.y * cellH + pad, Math.max(1, cellW - pad * 2), Math.max(1, cellH - pad * 2));
    }
  }
  // viewport rectangle
  const worldW = state.size * TILE_W;
  const worldH = state.size * TILE_H;
  const vw = (window.innerWidth / camera.zoom / worldW) * w;
  const vh = (window.innerHeight / camera.zoom / worldH) * h;
  const cx = (camera.cx / worldW + 0.5) * w;
  const cy = (camera.cy / worldH + 0.5) * h;
  ctx.fillStyle = 'rgba(63, 216, 194, 0.08)';
  ctx.fillRect(cx - vw / 2, cy - vh / 2, vw, vh);
  ctx.strokeStyle = 'rgba(63, 216, 194, 0.85)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(cx - vw / 2, cy - vh / 2, vw, vh);
  if (hover) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeRect(hover.x * cellW, hover.y * cellH, cellW, cellH);
  }
}

let activeRenderer: GridRenderer | null = null;

export function setActiveRenderer(renderer: GridRenderer | null): void {
  activeRenderer = renderer;
}

export function getActiveRenderer(): GridRenderer | null {
  return activeRenderer;
}
