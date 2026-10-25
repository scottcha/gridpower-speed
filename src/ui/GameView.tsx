import { useEffect, useRef, useState } from 'react';
import { GridRenderer, setActiveRenderer } from '../render/renderer';
import { useGame } from '../state/store';
import { audio } from '../audio/audio';
import { STRUCTURES, TERRAINS } from '../engine/config';
import { tileAt } from '../engine/board';
import { TopBar } from './TopBar';
import { LeftRail } from './LeftRail';
import { RightRail } from './RightRail';
import { BuildBar } from './BuildBar';
import { Toasts } from './Toasts';
import { Modals } from './Modals';
import { Icon } from './Icons';
import { projection } from './derive';

export function GameView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GridRenderer | null>(null);
  const game = useGame((s) => s.game);
  const modal = useGame((s) => s.modal);
  const focus = useGame((s) => s.focus);
  const buildKind = useGame((s) => s.buildKind);
  const linkSource = useGame((s) => s.linkSource);
  const overlay = useGame((s) => s.overlay);
  const hover = useGame((s) => s.hover);
  const finishTurn = useGame((s) => s.finishTurn);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new GridRenderer(canvas, {
      getState: () => useGame.getState().game,
      getPlayerId: () => 0,
      getSelection: () => useGame.getState().selected,
      getOverlay: () => useGame.getState().overlay,
      getBuildKind: () => useGame.getState().buildKind,
      getLinkSource: () => useGame.getState().linkSource,
      getPreview: () => {
        const state = useGame.getState().game;
        return state ? projection(state) : null;
      },
      onTileClick: (pos, mods) => useGame.getState().handleTileClick(pos, mods),
      onHover: (pos, screen) => {
        useGame.getState().setHover(pos);
        setTip(screen && pos ? { x: screen.x, y: screen.y } : null);
      },
      onCamera: () => {},
    });
    rendererRef.current = renderer;
    setActiveRenderer(renderer);
    const state = useGame.getState().game;
    const start = state?.tiles.find((t) => t.structure?.kind === 'substation' && t.structure.owner === 0);
    if (start) {
      renderer.setZoom((state?.size ?? 20) >= 22 ? 0.68 : (state?.size ?? 20) >= 18 ? 0.8 : 0.92);
      renderer.focusTile(start.x, start.y, true);
    }
    const resume = () => audio.resume();
    window.addEventListener('pointerdown', resume, { once: true });
    return () => {
      window.removeEventListener('pointerdown', resume);
      setActiveRenderer(null);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (focus && rendererRef.current) rendererRef.current.focusTile(focus.x, focus.y);
  }, [focus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const store = useGame.getState();
      if (event.code === 'Space' || event.key === 'Enter') {
        event.preventDefault();
        if (store.modal === 'summary') store.setModal(null);
        else if (!store.modal) store.finishTurn();
        return;
      }
      const key = event.key.toLowerCase();
      const pan = 90;
      if (key === 'a' || event.key === 'ArrowLeft') rendererRef.current?.panBy(pan, 0);
      if (key === 'd' || event.key === 'ArrowRight') rendererRef.current?.panBy(-pan, 0);
      if (key === 'w' || event.key === 'ArrowUp') rendererRef.current?.panBy(0, pan);
      if (key === 's' || event.key === 'ArrowDown') rendererRef.current?.panBy(0, -pan);
      if (event.key === '+' || event.key === '=') rendererRef.current?.zoomBy(1.12);
      if (event.key === '-' || event.key === '_') rendererRef.current?.zoomBy(1 / 1.12);
      if (event.key === 'Escape') {
        if (store.modal) store.setModal(null);
        else if (store.buildKind || store.linkSource) store.cancelLink();
        else store.select(null);
        return;
      }
      if (key === 't') store.setModal(store.modal === 'tech' ? null : 'tech');
      if (key === 'm') store.setModal(store.modal === 'market' ? null : 'market');
      if (key === 'e') store.setModal(store.modal === 'empire' ? null : 'empire');
      if (key === 'r') store.setModal(store.modal === 'rivals' ? null : 'rivals');
      if (key === 'h' || event.key === 'F1') store.setModal(store.modal === 'help' ? null : 'help');
      if (key === '1') store.setOverlay('power');
      if (key === '2') store.setOverlay('compute');
      if (key === '3') store.setOverlay('territory');
      if (key === '4') store.setOverlay('economy');
      if (key === 'f') {
        const tile = store.game?.tiles.find((t) => t.structure?.kind === 'substation' && t.structure.owner === 0);
        if (tile) store.focusTile(tile.x, tile.y);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!game) return;
    const active = game.tiles.find((t) => t.structure?.kind === 'substation' && t.structure.owner === 0);
    if (active && rendererRef.current && game.turn === 1) rendererRef.current.focusTile(active.x, active.y);
  }, [game?.seed]);

  if (!game) return null;

  const hoveredTile = hover ? tileAt(game, hover.x, hover.y) : null;
  const hoverTitle = hoveredTile
    ? hoveredTile.structure
      ? STRUCTURES[hoveredTile.structure.kind].name
      : TERRAINS[hoveredTile.terrain].name
    : '';
  const hoverOwner = hoveredTile?.owner === null ? 'Unclaimed' : hoveredTile?.owner !== undefined && hoveredTile.owner >= 0 ? game.players[hoveredTile.owner].corp : '';

  return (
    <div className="game">
      <canvas className="world" ref={canvasRef} />
      <div className="hud">
        <TopBar />
        <LeftRail />
        <RightRail />
        <BuildBar />

        <div className="end-turn">
          <div className="end-turn-hint">
            {game.victory.over ? 'Campaign complete' : <>Rivals move on end turn · <kbd>Space</kbd></>}
          </div>
          <button
            className="btn primary"
            onClick={game.victory.over ? () => useGame.getState().setModal('victory') : finishTurn}
            title="End turn (Space)"
          >
            {game.victory.over ? (
              <>View result <Icon name="trophy" size={16} /></>
            ) : (
              <>
                End turn <Icon name="arrowRight" size={16} />
              </>
            )}
          </button>
        </div>

        {(buildKind || linkSource) && (
          <div className="mode-banner">
            <Icon name={buildKind ? 'grid' : 'link'} size={13} />
            {buildKind
              ? `Placing ${STRUCTURES[buildKind].name} — click a valid tile, Esc to cancel`
              : 'Corridor mode — click a second substation, Esc to cancel'}
            <button className="btn small ghost" onClick={() => useGame.getState().cancelLink()}>
              Cancel
            </button>
          </div>
        )}

        {tip && hoveredTile && !modal && (
          <div className="tooltip" style={{ left: Math.min(tip.x + 16, window.innerWidth - 240), top: Math.min(tip.y + 18, window.innerHeight - 90) }}>
            <div style={{ fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: hoveredTile.owner === null ? '#8fa6b8' : game.players[hoveredTile.owner].color }} />
              {hoverTitle}
            </div>
            <div style={{ color: 'var(--dim)', marginTop: 2 }}>
              {hoverOwner}
              {hoveredTile.structure && hoveredTile.structure.owner >= 0 ? ` · ${game.players[hoveredTile.structure.owner].corp}` : ''}
              {hoveredTile.owner === 0 && !hoveredTile.structure ? ' · click to build' : ''}
            </div>
          </div>
        )}
      </div>
      <Toasts />
      <Modals />
      {overlay !== 'none' && !modal && <div className="mode-banner" style={{ top: 'auto', bottom: 92, background: 'rgba(10,20,30,0.8)', borderColor: 'var(--border)', color: 'var(--muted)' }}>
        <Icon name="layers" size={12} /> {overlay} overlay · press 1–4 to switch, click the same layer to clear
      </div>}
    </div>
  );
}
