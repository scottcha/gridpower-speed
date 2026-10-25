import { useGame } from '../state/store';
import { STRUCTURES, POLICIES, TERRAINS, BALANCE } from '../engine/config';
import { attachedSubstation, tileAt } from '../engine/board';
import { canClaim, canUpgrade, substationThroughput, lineRange, techMods, UPGRADES } from '../engine/progression';
import { structureOutput } from '../engine/grid';

import { Icon } from './Icons';
import { money, number, pct } from './format';
import { batteryStats, dcStats, projection, structureIcon } from './derive';
import type { PlayerTurnReport, Tile } from '../engine/types';
import { TERRAIN_PALETTE } from '../render/palette';

export function TilePanel() {
  const game = useGame((s) => s.game);
  const rev = useGame((s) => s.rev);
  const selected = useGame((s) => s.selected);
  const beginLink = useGame((s) => s.beginLink);
  const cancelLink = useGame((s) => s.cancelLink);
  const linkSource = useGame((s) => s.linkSource);
  const setPolicy = useGame((s) => s.setPolicy);
  const focusTile = useGame((s) => s.focusTile);
  if (!game || !selected) return null;
  const tile = tileAt(game, selected.x, selected.y);
  if (!tile) return null;
  const report = projection(game);
  const structure = tile.structure;
  const def = structure ? STRUCTURES[structure.kind] : null;
  const owner = tile.owner;
  const stOwner = structure?.owner ?? null;
  const mine = owner === 0;
  const structureMine = stOwner === 0;
  const palette = TERRAIN_PALETTE[tile.terrain];
  const terrain = TERRAINS[tile.terrain];

  const swatchColor = structure && stOwner !== null && stOwner >= 0 ? game.players[stOwner].color : palette.top[0];
  const title = structure ? def!.name : terrain.name;
  const subtitle = structure ? (stOwner !== null && stOwner >= 0 ? game.players[stOwner].corp : 'Neutral asset') : owner === null ? 'Unclaimed territory' : owner === 0 ? 'Your territory' : game.players[owner].corp;

  return (
    <div className="card" key={`${selected.x}-${selected.y}`} data-rev={rev}>
      <div className="card-head">
        <div className="card-title">
          <Icon name="cursor" size={13} /> Tile {selected.x}, {selected.y}
        </div>
        <button className="close-btn" style={{ width: 24, height: 24 }} onClick={() => useGame.getState().select(null)} title="Deselect (Esc)">
          <Icon name="close" size={13} />
        </button>
      </div>
      <div className="card-body">
        <div className="tile-head">
          <div className="tile-swatch" style={{ background: swatchColor, color: '#06121a' }}>
            <Icon name={structure ? structureIcon(structure.kind) : 'map'} size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="tile-name">{title}</div>
            <div className="tile-sub">{subtitle}</div>
          </div>
        </div>

        <div className="chip-row">
          {owner === 0 && <span className="chip good">Yours</span>}
          {owner === null && <span className="chip">Unowned</span>}
          {owner !== null && owner !== 0 && <span className="chip bad">Rival</span>}
          {structureMine && <GridChip tile={tile} />}
          {structure?.kind === 'substation' && stOwner === 0 && <span className="chip">Hub</span>}
          {tile.terrain === 'geothermal' && <span className="chip warn">Geothermal</span>}
          {tile.terrain === 'river' && <span className="chip">Hydro site</span>}
          {tile.terrain === 'basin' && <span className="chip">Gas basin</span>}
          {tile.terrain === 'urban' && <span className="chip">Metro</span>}
        </div>

        {!structure && (
          <>
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{terrain.blurb}</p>
            {tile.terrain === 'river' && !game.players[0].techs.includes('hydropower') && (
              <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--amber)' }}>Research Hydropower to build a dam here.</div>
            )}
            {tile.terrain === 'geothermal' && !game.players[0].techs.includes('enhancedGeothermal') && (
              <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--amber)' }}>Research Enhanced Geothermal to drill here.</div>
            )}
            <div className="stat-grid">
              <div className="stat-box">
                <div className="k">Solar</div>
                <div className="v">{pct(terrain.solar)}</div>
              </div>
              <div className="stat-box">
                <div className="k">Wind</div>
                <div className="v">{pct(terrain.wind)}</div>
              </div>
              <div className="stat-box">
                <div className="k">Cooling</div>
                <div className="v">{pct(terrain.cooling)}</div>
              </div>
              <div className="stat-box">
                <div className="k">Build cost</div>
                <div className="v">{pct(terrain.buildCost)}</div>
              </div>
            </div>
          </>
        )}

        {structure && structureMine && (
          <StructureDetails tile={tile} kind={structure.kind} report={report} />
        )}

        {structure && !structureMine && stOwner !== null && stOwner >= 0 && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            <div className="chipless">
              {def!.blurb}
            </div>
            <div style={{ marginTop: 8, color: 'var(--bad)', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
              <Icon name="lock" size={12} /> Rival infrastructure — claim adjacent land to compete for this region.
            </div>
          </div>
        )}

        {structure && structureMine && structure.kind === 'substation' && (
          <div className="actions">
            {linkSource ? (
              <>
                <span className="chip warn" style={{ alignSelf: 'center' }}>
                  Click a second substation
                </span>
                <button className="btn ghost" onClick={cancelLink}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="btn link" onClick={beginLink}>
                <Icon name="link" size={14} /> Build corridor
              </button>
            )}
          </div>
        )}

        {structure && structureMine && structure.kind !== 'substation' && (
          <div className="actions">
            <button className="btn ghost small" onClick={() => focusTile(selected.x, selected.y)}>
              <Icon name="cursor" size={13} /> Centre
            </button>
          </div>
        )}

        {!structure && mine && (
          <div style={{ marginTop: 11, fontSize: 11, color: 'var(--dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Icon name="cursor" size={12} /> Choose a structure from the build palette below.
          </div>
        )}

        {!structure && !mine && owner === null && (
          <ClaimBlock />
        )}

        {structure && structure.kind === 'edge' && structureMine && (
          <UpgradeBlock />
        )}
        {structure && structure.kind === 'hyperscale' && structureMine && (
          <UpgradeBlock />
        )}

        {structureMine && def && def.pue && (
          <PolicyBlock policy={dcStats(game, tile).policy} onPick={(policy) => setPolicy(policy, selected)} />
        )}
      </div>
    </div>
  );
}

function GridChip({ tile }: { tile: { x: number; y: number } }) {
  const game = useGame((s) => s.game);
  if (!game) return null;
  const st = tileAt(game, tile.x, tile.y)?.structure;
  if (!st) return null;
  const connected =
    st.kind === 'substation' ||
    game.tiles.some(
      (t) => t.structure?.kind === 'substation' && t.structure.owner === 0 && Math.abs(t.x - tile.x) + Math.abs(t.y - tile.y) <= BALANCE.attachRadius,
    );
  return <span className={`chip ${connected ? 'good' : 'bad'}`}>{connected ? 'Grid connected' : 'Off grid'}</span>;
}

function StructureDetails({ tile, kind, report }: { tile: Tile; kind: keyof typeof STRUCTURES; report: PlayerTurnReport }) {
  const game = useGame((s) => s.game);
  if (!game) return null;
  const player = game.players[0];
  const def = STRUCTURES[kind];
  const structure = tile.structure!;
  const mods = techMods(player);
  const isCompute = Boolean(def.pue);

  if (isCompute) {
    const stats = dcStats(game, tile);
    const delivered = stats.delivered;
    return (
      <>
        <p style={{ margin: '10px 0 8px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{def.blurb}</p>
        <div className="stat-grid">
          <div className="stat-box">
            <div className="k">Throughput</div>
            <div className="v">
              {pct(stats.util)} <small>util</small>
            </div>
          </div>
          <div className="stat-box">
            <div className="k">Compute</div>
            <div className="v">
              {number(stats.compute, 1)} <small>CU</small>
            </div>
          </div>
          <div className="stat-box">
            <div className="k">Power draw</div>
            <div className="v">
              {number(delivered, 1)} <small>/ {number(stats.request, 1)} MW</small>
            </div>
          </div>
          <div className="stat-box">
            <div className="k">PUE</div>
            <div className="v">{stats.pue.toFixed(2)}</div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--dim)' }}>
          {number(def.mw)} MW IT capacity · {def.eff!.toFixed(2)} CU/MW base · weather cooling ×{game.weather.cooling.toFixed(2)}
        </div>
        {stats.util < 0.97 && (
          <div className="chip bad" style={{ marginTop: 8 }}>
            <Icon name="warning" size={11} /> Short {number(Math.max(0, stats.request - delivered), 1)} MW — add generation
          </div>
        )}
        <div className="chip-row">
          <span className="chip">Maint {money(def.maintenance)}/turn</span>
          <span className="chip">RP +{def.rp}/turn</span>
          {structure.policy && <span className="chip warn">Site policy</span>}
        </div>
      </>
    );
  }

  if (def.category === 'generation') {
    const output = structureOutput(game, player, tile);
    const factor = output / Math.max(0.01, def.mw);
    const weatherNote =
      kind === 'solar'
        ? `sun ×${game.weather.solar.toFixed(2)}`
        : kind === 'wind'
          ? `wind ×${game.weather.wind.toFixed(2)}`
          : kind === 'hydro'
            ? `rain ×${game.weather.hydro.toFixed(2)}`
            : 'weather-proof';
    return (
      <>
        <p style={{ margin: '10px 0 8px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{def.blurb}</p>
        <div className="stat-grid">
          <div className="stat-box">
            <div className="k">Output now</div>
            <div className="v">
              {number(output, 1)} <small>MW</small>
            </div>
          </div>
          <div className="stat-box">
            <div className="k">Nameplate</div>
            <div className="v">{number(def.mw)} <small>MW</small></div>
          </div>
          <div className="stat-box">
            <div className="k">Capacity factor</div>
            <div className="v">{pct(Math.min(1, factor))}</div>
          </div>
          <div className="stat-box">
            <div className="k">Fuel</div>
            <div className="v">{def.fuel ? `$${(def.fuel * game.market.events.reduce((m, e) => m * (e.fuelMult ?? 1), 1)).toFixed(1)}` : 'free'} <small>/MW</small></div>
          </div>
        </div>
        <div className="chip-row">
          <span className="chip">{weatherNote}</span>
          <span className="chip">Maint {money(def.maintenance)}/turn</span>
          <span className="chip">+{pct(mods.gen - 1)} grid ops</span>
        </div>
      </>
    );
  }

  if (kind === 'battery') {
    const battery = batteryStats(tile);
    const soc = battery.soc / battery.storage;
    return (
      <>
        <p style={{ margin: '10px 0 8px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{def.blurb}</p>
        <div style={{ marginTop: 2 }}>
          <div className="victory-top">
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>State of charge</span>
            <span style={{ fontSize: 11, color: soc > 0.5 ? 'var(--good)' : 'var(--amber)' }}>
              {number(battery.soc, 1)} / {number(battery.storage)} MWh
            </span>
          </div>
          <div className="victory-bar" style={{ height: 7 }}>
            <i style={{ width: `${Math.min(100, soc * 100)}%`, background: soc > 0.5 ? 'linear-gradient(90deg,#2bb7a6,#8ef0c2)' : 'linear-gradient(90deg,#b07a2a,#ffd166)' }} />
          </div>
        </div>
        <div className="stat-grid">
          <div className="stat-box">
            <div className="k">Discharge rate</div>
            <div className="v">{number(battery.rate)} <small>MW</small></div>
          </div>
          <div className="stat-box">
            <div className="k">Round trip</div>
            <div className="v">90%</div>
          </div>
        </div>
      </>
    );
  }

  if (kind === 'substation') {
    const attached = game.tiles.filter((t) => {
      if (!t.structure || t.structure.owner !== 0 || t.structure.kind === 'substation') return false;
      const nearest = attachedSubstation(game, t, 0, BALANCE.attachRadius);
      return nearest !== null && nearest.x === tile.x && nearest.y === tile.y;
    }).length;
    const corridors = game.links.filter((l) => l.owner === 0 && ((l.a.x === tile.x && l.a.y === tile.y) || (l.b.x === tile.x && l.b.y === tile.y))).length;
    const island = report.islands.find((i) => i.substations.some((s) => s.x === tile.x && s.y === tile.y));
    return (
      <>
        <p style={{ margin: '10px 0 8px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{def.blurb}</p>
        <div className="stat-grid">
          <div className="stat-box">
            <div className="k">Throughput</div>
            <div className="v">{number(substationThroughput(player))} <small>MW</small></div>
          </div>
          <div className="stat-box">
            <div className="k">Attached assets</div>
            <div className="v">{attached}</div>
          </div>
          <div className="stat-box">
            <div className="k">Corridors</div>
            <div className="v">{corridors} <small>range {lineRange(player)}</small></div>
          </div>
          <div className="stat-box">
            <div className="k">Island stability</div>
            <div className="v" style={{ color: island && island.stability < 60 ? 'var(--bad)' : undefined }}>
              {island ? `${island.stability.toFixed(0)}%` : '—'}
            </div>
          </div>
        </div>
        {island && (
          <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--dim)' }}>
            Island: {number(island.generation)} MW gen · {number(island.load)} MW load · {number(island.imported)} MW imported · {island.congested} congested corridor{island.congested === 1 ? '' : 's'}
          </div>
        )}
      </>
    );
  }

  if (kind === 'lab') {
    return (
      <>
        <p style={{ margin: '10px 0 8px', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{def.blurb}</p>
        <div className="stat-grid">
          <div className="stat-box">
            <div className="k">Research</div>
            <div className="v">+{def.rp} <small>RP</small></div>
          </div>
          <div className="stat-box">
            <div className="k">Upkeep</div>
            <div className="v">{money(def.maintenance)}</div>
          </div>
        </div>
      </>
    );
  }

  return null;
}

function ClaimBlock() {
  const game = useGame((s) => s.game);
  const selected = useGame((s) => s.selected);
  const claim = useGame((s) => s.claim);
  if (!game || !selected) return null;
  const tile = tileAt(game, selected.x, selected.y);
  if (!tile) return null;
  const legality = canClaim(game, game.players[0], tile);
  const neutral = tile.structure?.owner === -1;
  return (
    <>
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
        {neutral ? 'A stranded substation sits here. Capturing it inherits a ready-made hub.' : 'Claiming extends your territory and reveals adjacent land.'}
      </div>
      <div className="actions">
        <button className={`btn ${neutral ? 'warm' : 'primary'}`} disabled={!legality.ok} onClick={claim}>
          <Icon name="flag" size={14} /> {neutral ? 'Capture hub' : 'Claim land'}
          <span className="cost">{money(legality.cost)}</span>
        </button>
      </div>
      {!legality.ok && <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--bad)' }}>{legality.reason}</div>}
    </>
  );
}

function UpgradeBlock() {
  const game = useGame((s) => s.game);
  const selected = useGame((s) => s.selected);
  const upgrade = useGame((s) => s.upgrade);
  if (!game || !selected) return null;
  const tile = tileAt(game, selected.x, selected.y);
  if (!tile?.structure) return null;
  const next = UPGRADES[tile.structure.kind];
  if (!next) return null;
  const legality = canUpgrade(game.players[0], tile);
  const nextDef = STRUCTURES[next];
  return (
    <div className="actions">
      <button className="btn warm" disabled={!legality.ok} onClick={upgrade}>
        <Icon name="arrowRight" size={14} /> Upgrade to {nextDef.short}
        <span className="cost">{money(legality.cost)}</span>
      </button>
      {!legality.ok && <span style={{ fontSize: 10.5, color: 'var(--bad)', alignSelf: 'center' }}>{legality.reason}</span>}
    </div>
  );
}

function PolicyBlock({ policy, onPick }: { policy: keyof typeof POLICIES; onPick: (policy: keyof typeof POLICIES) => void }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="card-title" style={{ marginBottom: 6 }}>
        <Icon name="settings" size={12} /> Operating policy
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        {(Object.keys(POLICIES) as (keyof typeof POLICIES)[]).map((id) => (
          <button
            key={id}
            className={`policy-option ${policy === id ? 'active' : ''}`}
            style={{ padding: '6px 8px' }}
            title={POLICIES[id].blurb}
            onClick={() => onPick(id)}
          >
            <b>{POLICIES[id].short}</b>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 6, lineHeight: 1.4 }}>
        {POLICIES[policy].blurb}
      </div>
    </div>
  );
}
