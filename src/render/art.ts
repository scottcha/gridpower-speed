/** Hand-authored vector art for every structure: isometric prisms, lit faces, moving parts. */
import { STRUCTURES } from '../engine/config';
import type { Structure, StructureKind, Tile } from '../engine/types';
import { STRUCTURE_ACCENTS, withAlpha } from './palette';

export interface StructureDrawContext {
  ctx: CanvasRenderingContext2D;
  /** Screen position of the tile centre. */
  x: number;
  y: number;
  scale: number;
  time: number;
  owner: number;
  color: string;
  accent: string;
  structure: Structure;
  tile: Tile;
  utilisation: number;
  connected: boolean;
}

function prism(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hw: number,
  hh: number,
  height: number,
  top: string,
  left: string,
  right: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y - hh);
  ctx.lineTo(x + hw, y);
  ctx.lineTo(x, y + hh);
  ctx.lineTo(x - hw, y);
  ctx.closePath();
  ctx.fillStyle = top;
  ctx.fill();
  // left face
  ctx.beginPath();
  ctx.moveTo(x - hw, y);
  ctx.lineTo(x, y + hh);
  ctx.lineTo(x, y + hh - height);
  ctx.lineTo(x - hw, y - height);
  ctx.closePath();
  ctx.fillStyle = left;
  ctx.fill();
  // right face
  ctx.beginPath();
  ctx.moveTo(x + hw, y);
  ctx.lineTo(x, y + hh);
  ctx.lineTo(x, y + hh - height);
  ctx.lineTo(x + hw, y - height);
  ctx.closePath();
  ctx.fillStyle = right;
  ctx.fill();
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rw: number, rh: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y + 2, rw, rh, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(4, 10, 16, 0.32)';
  ctx.fill();
  ctx.restore();
}

function flag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, accent: string, scale: number, time: number): void {
  const h = 18 * scale;
  ctx.strokeStyle = 'rgba(226,240,250,0.85)';
  ctx.lineWidth = Math.max(1, 1.4 * scale);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
  const wave = Math.sin(time * 3 + x * 0.05) * 2 * scale;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.quadraticCurveTo(x + 5 * scale, y - h + wave, x + 10 * scale, y - h + 1.5 * scale + wave * 0.4);
  ctx.lineTo(x + 10 * scale, y - h + 6 * scale + wave * 0.4);
  ctx.quadraticCurveTo(x + 5 * scale, y - h + 4.5 * scale + wave, x, y - h + 6 * scale);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = withAlpha(accent, 0.9);
  ctx.lineWidth = Math.max(0.6, 0.8 * scale);
  ctx.stroke();
}

function leds(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, time: number, color: string, count = 5): void {
  for (let i = 0; i < count; i++) {
    const on = (Math.sin(time * 2.2 + i * 1.7) + 1) / 2 > 0.42;
    ctx.fillStyle = on ? color : 'rgba(30,50,60,0.85)';
    ctx.fillRect(x + i * (w / count), y, Math.max(1, w / count - 1.6), Math.max(1, 1.6));
  }
}

function fans(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, speed = 4, count = 1): void {
  for (let f = 0; f < count; f++) {
    const fx = x + f * r * 2.4;
    ctx.strokeStyle = 'rgba(207,231,247,0.9)';
    ctx.lineWidth = Math.max(0.7, r * 0.18);
    for (let i = 0; i < 3; i++) {
      const a = time * speed + (i * Math.PI * 2) / 3 + f;
      ctx.beginPath();
      ctx.moveTo(fx, y);
      ctx.lineTo(fx + Math.cos(a) * r, y + Math.sin(a) * r * 0.5);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(fx, y, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#dfeaf4';
    ctx.fill();
  }
}

function steam(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, time: number, seed: number): void {
  for (let i = 0; i < 4; i++) {
    const t = ((time * 0.55 + i * 0.25 + seed) % 1);
    const radius = (2 + t * 9) * scale;
    ctx.beginPath();
    ctx.arc(x + Math.sin(t * 7 + seed) * 4 * scale, y - t * 34 * scale, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(226,238,248,${0.24 * (1 - t)})`;
    ctx.fill();
  }
}

export function drawStructure(c: StructureDrawContext): void {
  const { ctx, scale, time, structure, tile } = c;
  const kind = structure.kind;
  const accent = STRUCTURE_ACCENTS[kind] ?? '#9fd6ff';
  const s = scale * 1.72;
  const x = c.x;
  const y = c.y + 4 * s;

  ctx.save();
  // ownership plinth
  ctx.beginPath();
  ctx.moveTo(x, y - 15 * s);
  ctx.lineTo(x + 33 * s, y);
  ctx.lineTo(x, y + 15 * s);
  ctx.lineTo(x - 33 * s, y);
  ctx.closePath();
  ctx.fillStyle = withAlpha(c.color, c.owner >= 0 ? 0.2 : 0.08);
  ctx.fill();
  ctx.strokeStyle = withAlpha(c.accent, c.owner >= 0 ? 0.55 : 0.2);
  ctx.lineWidth = 1.1 * s;
  ctx.stroke();
  shadow(ctx, x, y + 3 * s, 26 * s, 11 * s);

  switch (kind) {
    case 'solar': {
      prism(ctx, x, y, 28 * s, 13 * s, 3 * s, '#3f4a56', '#2b333d', '#1f262e');
      const rows = 3;
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < 2; col++) {
          const px = x - 18 * s + col * 18 * s + r * 3 * s;
          const py = y - 10 * s + r * 7 * s + col * 5 * s;
          ctx.beginPath();
          ctx.moveTo(px - 8 * s, py);
          ctx.lineTo(px + 3 * s, py - 4.5 * s);
          ctx.lineTo(px + 11 * s, py);
          ctx.lineTo(px, py + 4.5 * s);
          ctx.closePath();
          const g = ctx.createLinearGradient(px - 8 * s, py - 4 * s, px + 8 * s, py + 4 * s);
          g.addColorStop(0, '#3d7fc4');
          g.addColorStop(0.55, '#1f4f86');
          g.addColorStop(1, '#163a63');
          ctx.fillStyle = g;
          ctx.fill();
          ctx.strokeStyle = 'rgba(199,225,246,0.6)';
          ctx.lineWidth = 0.7 * s;
          ctx.stroke();
          // panel grid
          ctx.strokeStyle = 'rgba(150,200,240,0.28)';
          ctx.beginPath();
          ctx.moveTo(px - 4 * s, py - 2.2 * s);
          ctx.lineTo(px + 4 * s, py + 2.2 * s);
          ctx.moveTo(px + 1 * s, py - 3.4 * s);
          ctx.lineTo(px + 5.5 * s, py - 0.6 * s);
          ctx.stroke();
        }
      }
      const glint = (time * 0.35) % 1;
      ctx.fillStyle = `rgba(190,235,255,${0.16 + 0.2 * Math.sin(time * 2.2)})`;
      ctx.fillRect(x - 20 * s + glint * 34 * s, y - 9 * s, 6 * s, 4 * s);
      break;
    }
    case 'wind': {
      const poleH = 44 * s;
      ctx.strokeStyle = '#dbe7f2';
      ctx.beginPath();
      ctx.lineWidth = 2.6 * s;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - poleH);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,150,175,0.7)';
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.moveTo(x - 1.2 * s, y);
      ctx.lineTo(x - 1.2 * s, y - poleH);
      ctx.stroke();
      // nacelle
      prism(ctx, x, y - poleH, 7 * s, 4 * s, 3 * s, '#f2f7fb', '#b7c4d2', '#94a3b3');
      const spin = time * (1.15 + tile.variant * 0.6);
      ctx.save();
      ctx.translate(x + 2 * s, y - poleH - 1 * s);
      for (let i = 0; i < 3; i++) {
        const a = spin + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 17 * s, Math.sin(a) * 6.5 * s - 1 * s);
        ctx.lineTo(Math.cos(a + 0.16) * 9 * s, Math.sin(a + 0.16) * 3.4 * s - 1 * s);
        ctx.closePath();
        ctx.fillStyle = '#e8f2fa';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 2.2 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#9fb2c4';
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#2b3d4c';
      ctx.fillRect(x - 2 * s, y - 3 * s, 4 * s, 3 * s);
      break;
    }
    case 'gas': {
      prism(ctx, x - 2 * s, y, 24 * s, 11 * s, 15 * s, '#d9e2ec', '#a3b0be', '#7d8b9b');
      // turbine hall vents
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? '#8794a4' : '#6f7d8d';
        ctx.fillRect(x - 18 * s + i * 8 * s, y - 14 * s + i * 1.5 * s, 5 * s, 2.5 * s);
      }
      // exhaust stacks
      for (let i = 0; i < 2; i++) {
        const sx = x + 10 * s + i * 12 * s;
        const sh = 30 * s;
        ctx.fillStyle = '#c3cedb';
        ctx.fillRect(sx - 2.6 * s, y - sh, 5.2 * s, sh);
        ctx.fillStyle = '#8d9bac';
        ctx.fillRect(sx + 0.4 * s, y - sh, 2.2 * s, sh);
        ctx.beginPath();
        ctx.ellipse(sx, y - sh, 2.6 * s, 1.3 * s, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#e3ebf3';
        ctx.fill();
        steam(ctx, sx, y - sh - 3 * s, s, time, i * 0.6);
      }
      const blink = Math.sin(time * 5) > 0.4;
      ctx.fillStyle = blink ? '#ffb35c' : '#5d4a32';
      ctx.beginPath();
      ctx.arc(x + 22 * s, y - 18 * s, 1.9 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'hydro': {
      // dam wall across the river
      prism(ctx, x, y, 34 * s, 11 * s, 10 * s, '#cfd9e3', '#8f9dab', '#6a7887');
      // spillway water
      const flow = (time * 1.6) % 1;
      ctx.fillStyle = 'rgba(90, 200, 240, 0.85)';
      ctx.fillRect(x - 13 * s, y - 3 * s, 9 * s, 7 * s);
      ctx.fillStyle = 'rgba(190, 240, 255, 0.7)';
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 13 * s + ((i * 2.4 + flow * 2.4) % 8) * s, y - 1 * s + i * 1.4 * s, 1.6 * s, 1.6 * s);
      // powerhouse
      prism(ctx, x + 14 * s, y - 2 * s, 13 * s, 7 * s, 8 * s, '#dbe5ef', '#a8b5c3', '#828f9e');
      flagsSmall(ctx, x + 14 * s, y - 10 * s, c.color, s);
      // generators
      fans(ctx, x + 11 * s, y - 5 * s, 2.6 * s, time, 6, 2);
      break;
    }
    case 'nuclear': {
      // containment dome
      ctx.beginPath();
      ctx.arc(x - 14 * s, y - 2 * s, 11 * s, Math.PI, 0);
      ctx.lineTo(x - 3 * s, y - 2 * s);
      ctx.closePath();
      ctx.fillStyle = '#dbe6ef';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,150,175,0.7)';
      ctx.stroke();
      // cooling towers
      for (let i = 0; i < 2; i++) {
        const tx = x + 6 * s + i * 15 * s;
        const h = 30 * s;
        ctx.beginPath();
        ctx.moveTo(tx - 6 * s, y);
        ctx.quadraticCurveTo(tx - 3.4 * s, y - h * 0.65, tx - 4 * s, y - h);
        ctx.lineTo(tx + 4 * s, y - h);
        ctx.quadraticCurveTo(tx + 3.4 * s, y - h * 0.65, tx + 6 * s, y);
        ctx.closePath();
        const g = ctx.createLinearGradient(tx - 6 * s, 0, tx + 6 * s, 0);
        g.addColorStop(0, '#b9c6d3');
        g.addColorStop(0.5, '#e6eef6');
        g.addColorStop(1, '#96a5b4');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(tx, y - h, 4 * s, 1.4 * s, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#7c8a99';
        ctx.fill();
        steam(ctx, tx, y - h - 2 * s, s * 1.15, time, i * 0.5 + 0.2);
      }
      ctx.fillStyle = Math.sin(time * 3) > 0 ? '#ff6b6b' : '#5a2b2b';
      ctx.beginPath();
      ctx.arc(x - 14 * s, y - 14 * s, 1.7 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'geothermal': {
      prism(ctx, x - 6 * s, y, 10 * s, 5 * s, 6 * s, '#c8d2dc', '#98a6b4', '#74818f');
      prism(ctx, x + 8 * s, y + 2 * s, 8 * s, 4 * s, 4 * s, '#b9c4cf', '#8b98a6', '#6a7785');
      // pipe loop
      ctx.strokeStyle = '#d98d63';
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.moveTo(x - 8 * s, y - 5 * s);
      ctx.bezierCurveTo(x - 2 * s, y - 12 * s, x + 4 * s, y - 10 * s, x + 7 * s, y - 4 * s);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,190,140,0.6)';
      ctx.lineWidth = 0.9 * s;
      ctx.stroke();
      steam(ctx, x - 6 * s, y - 8 * s, s, time, 0.1);
      steam(ctx, x + 8 * s, y - 2 * s, s * 0.8, time, 0.7);
      break;
    }
    case 'battery': {
      const soc = structure.charge ?? 0;
      const max = STRUCTURES.battery.storage ?? 48;
      prism(ctx, x, y, 30 * s, 13 * s, 2 * s, '#33404d', '#222c36', '#182028');
      for (let i = 0; i < 3; i++) {
        const bx = x - 19 * s + i * 15 * s;
        prism(ctx, bx, y - 1 * s, 7 * s, 4 * s, 9 * s, '#dfe9f2', '#a9b7c5', '#7f8d9c');
        // level bar
        const h = 7 * s * Math.min(1, soc / max);
        ctx.fillStyle = '#1d3b34';
        ctx.fillRect(bx - 2.4 * s, y - 9 * s, 4.8 * s, 7 * s);
        ctx.fillStyle = soc / max > 0.55 ? '#8ef0c2' : soc / max > 0.2 ? '#ffd166' : '#ff7a59';
        ctx.fillRect(bx - 2.4 * s, y - 2 * s - h, 4.8 * s, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 0.6 * s;
        ctx.strokeRect(bx - 2.4 * s, y - 9 * s, 4.8 * s, 7 * s);
      }
      flag(ctx, x + 24 * s, y - 4 * s, c.color, c.accent, s, time);
      break;
    }
    case 'substation': {
      // platform + fence
      prism(ctx, x, y, 32 * s, 15 * s, 2 * s, '#4a5563', '#333c47', '#252d36');
      ctx.strokeStyle = 'rgba(190,215,235,0.4)';
      ctx.lineWidth = 0.8 * s;
      ctx.strokeRect(x - 26 * s, y - 12 * s, 52 * s, 24 * s);
      // transformers
      for (let i = 0; i < 2; i++) {
        const tx = x - 14 * s + i * 20 * s;
        prism(ctx, tx, y - 1 * s, 8 * s, 5 * s, 8 * s, '#c4ceda', '#929fad', '#6d7a89');
        ctx.fillStyle = '#7d8a99';
        for (let f = 0; f < 3; f++) ctx.fillRect(tx - 6 * s + f * 4.4 * s, y - 7 * s, 1.4 * s, 5 * s);
      }
      // busbars and insulators
      ctx.strokeStyle = '#a9c7e8';
      ctx.lineWidth = 1.4 * s;
      ctx.beginPath();
      ctx.moveTo(x - 22 * s, y - 14 * s);
      ctx.lineTo(x + 22 * s, y - 14 * s);
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const ix = x - 20 * s + i * 10 * s;
        ctx.strokeStyle = '#dfe9f2';
        ctx.beginPath();
        ctx.moveTo(ix, y - 14 * s);
        ctx.lineTo(ix, y - 22 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ix, y - 23 * s, 1.6 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#a9c7e8';
        ctx.fill();
      }
      // live status
      const pulse = 0.55 + 0.45 * Math.sin(time * 4);
      ctx.fillStyle = `rgba(120,255,210,${c.connected ? pulse : 0.25})`;
      ctx.beginPath();
      ctx.arc(x + 26 * s, y - 20 * s, 2.2 * s, 0, Math.PI * 2);
      ctx.fill();
      flag(ctx, x - 27 * s, y - 2 * s, c.color, c.accent, s, time);
      break;
    }
    case 'edge': {
      prism(ctx, x, y, 20 * s, 10 * s, 11 * s, '#dbe5ef', '#a7b4c2', '#7c8a99');
      // roof AC
      prism(ctx, x - 6 * s, y - 10 * s, 6 * s, 3 * s, 3 * s, '#eef4fa', '#c1cdd9', '#98a5b4');
      fans(ctx, x - 6 * s, y - 14 * s, 2.2 * s, time, 7, 1);
      // server window
      ctx.fillStyle = '#13202b';
      ctx.fillRect(x + 3 * s, y - 8 * s, 13 * s, 3 * s);
      leds(ctx, x + 4 * s, y - 7.4 * s, 11 * s, time, accent, 4);
      // antenna
      ctx.strokeStyle = '#cdd9e5';
      ctx.lineWidth = 0.9 * s;
      ctx.beginPath();
      ctx.moveTo(x + 16 * s, y - 10 * s);
      ctx.lineTo(x + 16 * s, y - 24 * s);
      ctx.stroke();
      ctx.fillStyle = Math.sin(time * 3.5) > 0.5 ? '#7fe6ff' : '#2a4a58';
      ctx.beginPath();
      ctx.arc(x + 16 * s, y - 24 * s, 1.6 * s, 0, Math.PI * 2);
      ctx.fill();
      flag(ctx, x - 19 * s, y - 2 * s, c.color, c.accent, s, time);
      break;
    }
    case 'hyperscale': {
      prism(ctx, x - 6 * s, y, 32 * s, 13 * s, 16 * s, '#d5e0eb', '#9fadbc', '#768493');
      prism(ctx, x + 20 * s, y - 4 * s, 16 * s, 8 * s, 11 * s, '#c8d4e1', '#93a1b1', '#6c7a8a');
      // roof ridge lights + fans
      ctx.fillStyle = 'rgba(127,230,255,0.85)';
      ctx.fillRect(x - 30 * s, y - 16 * s, 44 * s, 1.6 * s);
      fans(ctx, x - 20 * s, y - 18 * s, 3.2 * s, time, 5, 2);
      fans(ctx, x + 12 * s, y - 22 * s, 2.6 * s, time, 6, 2);
      // loading bay
      ctx.fillStyle = '#1b2934';
      ctx.fillRect(x - 30 * s, y - 8 * s, 12 * s, 6 * s);
      leds(ctx, x - 28 * s, y - 6 * s, 8 * s, time, accent, 3);
      flag(ctx, x - 38 * s, y, c.color, c.accent, s, time);
      break;
    }
    case 'gigafactory': {
      prism(ctx, x, y, 46 * s, 19 * s, 22 * s, '#c9d6e3', '#93a3b3', '#6b7b8c');
      // sawtooth roof
      for (let i = 0; i < 4; i++) {
        const rx = x - 34 * s + i * 18 * s;
        ctx.beginPath();
        ctx.moveTo(rx, y - 22 * s);
        ctx.lineTo(rx + 9 * s, y - 30 * s);
        ctx.lineTo(rx + 18 * s, y - 22 * s);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? '#e8f1f9' : '#d3e0ec';
        ctx.fill();
        ctx.fillStyle = 'rgba(150,220,255,0.55)';
        ctx.fillRect(rx + 2 * s, y - 28 * s, 12 * s, 2 * s);
      }
      // cooling units
      fans(ctx, x - 34 * s, y - 6 * s, 4 * s, time, 4.5, 2);
      // glowing compute strip
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = `rgba(198,169,255,${0.35 + 0.4 * Math.sin(time * 2 + i * 0.7)})`;
        ctx.fillRect(x - 40 * s + i * 10 * s, y - 2 * s, 6 * s, 1.6 * s);
      }
      flag(ctx, x + 44 * s, y - 2 * s, c.color, c.accent, s, time);
      break;
    }
    case 'lab': {
      prism(ctx, x, y, 16 * s, 8 * s, 16 * s, '#e3ecf5', '#aebccb', '#8492a2');
      // glass front
      ctx.fillStyle = 'rgba(120,200,240,0.55)';
      ctx.fillRect(x - 12 * s, y - 12 * s, 10 * s, 9 * s);
      ctx.strokeStyle = 'rgba(230,245,255,0.6)';
      ctx.lineWidth = 0.7 * s;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 12 * s, y - 12 * s + i * 3 * s);
        ctx.lineTo(x - 2 * s, y - 12 * s + i * 3 * s);
        ctx.stroke();
      }
      // dish
      ctx.beginPath();
      ctx.ellipse(x + 12 * s, y - 20 * s, 6 * s, 4 * s, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#dfeaf4';
      ctx.fill();
      ctx.strokeStyle = '#9fb0c1';
      ctx.lineWidth = 0.8 * s;
      ctx.stroke();
      ctx.strokeStyle = '#cdd9e5';
      ctx.beginPath();
      ctx.moveTo(x + 12 * s, y - 20 * s);
      ctx.lineTo(x + 8 * s, y - 8 * s);
      ctx.stroke();
      flag(ctx, x - 15 * s, y - 2 * s, c.color, c.accent, s, time);
      break;
    }
    default:
      break;
  }

  // Utilisation ring for compute assets.
  if (STRUCTURES[kind].pue) {
    const r = 5.5 * s;
    const cx = x + 26 * s;
    const cy = y - 30 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, c.utilisation));
    ctx.strokeStyle = c.utilisation > 0.95 ? '#5df0b1' : c.utilisation > 0.5 ? '#ffd166' : '#ff7a59';
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(10,20,28,0.55)';
    ctx.lineWidth = 2 * s;
    ctx.stroke();
  }

  if (!c.connected) {
    ctx.strokeStyle = 'rgba(255,110,90,0.95)';
    ctx.lineWidth = 1.6 * s;
    const bx = x + 22 * s;
    const by = y - 30 * s;
    ctx.beginPath();
    ctx.moveTo(bx - 4 * s, by - 4 * s);
    ctx.lineTo(bx + 4 * s, by + 4 * s);
    ctx.moveTo(bx + 4 * s, by - 4 * s);
    ctx.lineTo(bx - 4 * s, by + 4 * s);
    ctx.stroke();
  }

  ctx.restore();
}

function flagsSmall(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, s: number): void {
  ctx.strokeStyle = '#e8f2fa';
  ctx.lineWidth = 0.8 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 10 * s);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 10 * s);
  ctx.lineTo(x + 6 * s, y - 8 * s);
  ctx.lineTo(x, y - 6 * s);
  ctx.closePath();
  ctx.fill();
}

export function structureIconColor(kind: StructureKind): string {
  return STRUCTURE_ACCENTS[kind] ?? '#9fd6ff';
}
