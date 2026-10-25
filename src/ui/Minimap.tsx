import { useEffect, useRef } from 'react';
import { drawMinimap, getActiveRenderer } from '../render/renderer';
import { useGame } from '../state/store';
import { Icon } from './Icons';
import { TERRAIN_PALETTE } from '../render/palette';

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hover = useGame((s) => s.hover);
  const focusTile = useGame((s) => s.focusTile);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const canvas = canvasRef.current;
      const state = useGame.getState().game;
      if (canvas && state) {
        const cam = getActiveRenderer()?.getCamera() ?? { cx: 0, cy: 0, zoom: 0.9 };
        drawMinimap(canvas, state, 0, cam, useGame.getState().hover);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div>
      <div className="minimap-wrap">
        <canvas
          ref={canvasRef}
          onClick={(event) => {
            const state = useGame.getState().game;
            if (!state) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const px = event.clientX - rect.left;
            const py = event.clientY - rect.top;
            const cellW = rect.width / state.size;
            const cellH = rect.height / state.size;
            const x = Math.floor(px / cellW);
            const y = Math.floor(py / cellH);
            if (x >= 0 && y >= 0 && x < state.size && y < state.size) focusTile(x, y);
          }}
        />
      </div>
      <div className="minimap-legend">
        <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <i style={{ width: 8, height: 8, borderRadius: 2, background: TERRAIN_PALETTE.plains.top[0], display: 'inline-block' }} />
          Your grid
        </span>
        <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <Icon name="cursor" size={11} /> Click to move
        </span>
        {hover && <span>{hover.x},{hover.y}</span>}
      </div>
    </div>
  );
}
