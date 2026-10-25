import { useGame } from '../state/store';
import { STRUCTURES, TERRAINS } from '../engine/config';
import { buildsFor } from '../engine/actions';
import { canBuild, canClaim } from '../engine/progression';
import { tileAt } from '../engine/board';
import { Icon } from './Icons';
import { money } from './format';
import { categoryColor } from './derive';
import { structureIcon } from './derive';

const ORDER: (keyof typeof STRUCTURES)[] = [
  'solar', 'wind', 'gas', 'hydro', 'geothermal', 'nuclear',
  'battery', 'substation', 'edge', 'hyperscale', 'gigafactory', 'lab',
];

export function BuildBar() {
  const game = useGame((s) => s.game);
  const rev = useGame((s) => s.rev);
  const selected = useGame((s) => s.selected);
  const build = useGame((s) => s.build);
  const claim = useGame((s) => s.claim);
  const buildKind = useGame((s) => s.buildKind);
  const linkSource = useGame((s) => s.linkSource);
  const cancelLink = useGame((s) => s.cancelLink);
  if (!game) return null;
  const tile = selected ? tileAt(game, selected.x, selected.y) : null;
  const player = game.players[0];
  const isMine = tile?.owner === 0;
  const empty = Boolean(tile && !tile.structure);
  const options = tile && isMine && empty ? buildsFor(player, tile).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)) : [];
  const claimLegality = tile ? canClaim(game, player, tile) : { ok: false, reason: '', cost: 0 };

  if (!tile) {
    return (
      <div className="build-bar" >
        <div className="build-hint">
          <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="cursor" size={14} /> Select a tile
          </div>
          Drag to pan · scroll to zoom · shift-click claims land. Build inside a substation radius to put power on the grid.
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="chip">T Tech</span>
          <span className="chip">M Markets</span>
          <span className="chip">Space End turn</span>
        </div>
      </div>
    );
  }

  if (!isMine) {
    return (
      <div className="build-bar" data-rev={rev} key={`claim-${tile.x}-${tile.y}`}>
        <div className="build-hint">
          <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 2 }}>
            {tile.structure?.owner === -1 ? 'Stranded substation' : TERRAINS[tile.terrain].name}
          </div>
          {tile.structure?.owner === -1
            ? 'A neutral hub from the old grid. Capture it to inherit the site.'
            : tile.owner === null
              ? 'Unclaimed land. Claims must border your territory and get dearer as you expand.'
              : 'Held by a rival. Expand around it or out-compete them for market share.'}
        </div>
        <div style={{ flex: 1 }} />
        {tile.owner === null && (
          <button className="btn primary" disabled={!claimLegality.ok} onClick={claim} title={claimLegality.reason}>
            <Icon name="flag" size={14} /> {tile.structure?.owner === -1 ? 'Capture hub' : 'Claim tile'}
            <span className="cost">{money(claimLegality.cost)}</span>
          </button>
        )}
        {!claimLegality.ok && <span style={{ fontSize: 10.5, color: 'var(--bad)', maxWidth: 160 }}>{claimLegality.reason}</span>}
      </div>
    );
  }

  if (!empty) {
    const structure = tile.structure!;
    const def = STRUCTURES[structure.kind];
    return (
      <div className="build-bar" data-rev={rev} key={`struct-${tile.x}-${tile.y}`}>
        <div className="build-hint">
          <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
            <Icon name={structureIcon(structure.kind)} size={13} style={{ color: categoryColor(structure.kind) }} /> {def.name}
          </div>
          {def.effect}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="chip">Upkeep {money(def.maintenance)}</span>
          <span className="chip">Built T{structure.builtTurn || 1}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="build-bar" data-rev={rev} key={`build-${tile.x}-${tile.y}`}>
      <div className="build-hint" style={{ minWidth: 118 }}>
        <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Icon name="grid" size={13} /> Build
        </div>
        {TERRAINS[tile.terrain].name} · {money(player.credits)} available
      </div>
      <div className="build-scroll">
        {options.map((kind) => {
          const legality = canBuild(player, tile, kind);
          const def = STRUCTURES[kind];
          return (
            <button
              key={kind}
              className={`build-option ${buildKind === kind ? 'active' : ''}`}
              disabled={!legality.ok}
              title={`${def.name} — ${def.blurb}${legality.ok ? '' : ` (${legality.reason})`}`}
              onClick={() => build(kind)}
            >
              <span className="bo-top">
                <Icon name={structureIcon(kind)} size={13} style={{ color: categoryColor(kind) }} />
                {def.short}
              </span>
              <span className="bo-cost">{money(legality.cost)}</span>
            </button>
          );
        })}
        {!options.length && <div style={{ fontSize: 11, color: 'var(--dim)', padding: '6px 4px' }}>No unlocked structure fits this terrain. Research more, or claim another site.</div>}
      </div>
      {linkSource && (
        <button className="btn ghost small" onClick={cancelLink}>
          Cancel link
        </button>
      )}
    </div>
  );
}
