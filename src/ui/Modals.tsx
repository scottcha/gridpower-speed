import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { BALANCE, BRANCH_META, POLICIES, STRUCTURES, TECHS, TECH_MAP } from '../engine/config';
import { techCost } from '../engine/progression';
import { computePriceFor, weatherById } from '../engine/markets';
import { Icon, type IconName } from './Icons';
import { money, moneyExact, number, pct, signed } from './format';
import { generatorMix, opexOf, projectedNet, projectedShare, projection, projectionFor, stabilityColor, structureIcon } from './derive';
import { Sparkline } from './Sparkline';
import type { TechDef } from '../engine/types';

function ModalShell({
  title,
  subtitle,
  icon,
  children,
  wide,
  narrow,
  onClose,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  children: React.ReactNode;
  wide?: boolean;
  narrow?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''} ${narrow ? 'narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <div className="modal-title">
              <Icon name={icon} size={20} style={{ color: 'var(--accent)' }} /> {title}
            </div>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Modals() {
  const modal = useGame((s) => s.modal);
  const setModal = useGame((s) => s.setModal);
  const game = useGame((s) => s.game);
  const rev = useGame((s) => s.rev);
  // Re-render open modals after any engine mutation (research, policies, upgrades).
  void rev;
  if (!modal || !game) return null;
  switch (modal) {
    case 'tech':
      return <TechModal onClose={() => setModal(null)} />;
    case 'market':
      return <MarketModal onClose={() => setModal(null)} />;
    case 'empire':
      return <EmpireModal onClose={() => setModal(null)} />;
    case 'rivals':
      return <RivalsModal onClose={() => setModal(null)} />;
    case 'help':
      return <HelpModal onClose={() => setModal(null)} />;
    case 'pause':
      return <PauseModal onClose={() => setModal(null)} />;
    case 'summary':
      return <SummaryModal onClose={() => setModal(null)} />;
    case 'victory':
      return <VictoryModal onClose={() => setModal(null)} />;
    case 'newgame':
      return <NewGameModal onClose={() => setModal(null)} />;
    default:
      return null;
  }
}

/* ------------------------------- Technology ------------------------------- */

function TechModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  const research = useGame((s) => s.research);
  const player = game.players[0];
  const branches = ['compute', 'energy', 'optimization', 'infrastructure'] as const;
  const grouped = useMemo(() => {
    const map: Record<string, TechDef[]> = { compute: [], energy: [], optimization: [], infrastructure: [] };
    for (const tech of TECHS) map[tech.branch].push(tech);
    for (const key of Object.keys(map)) map[key].sort((a, b) => a.tier - b.tier);
    return map;
  }, []);
  const researched = player.techs.length;
  return (
    <ModalShell
      title="Technology tree"
      subtitle={`${number(player.research)} research points banked · ${player.techs.length} technologies online. Research compounds: cheap options now, decisive options later.`}
      icon="flask"
      wide
      onClose={onClose}
    >
      <div className="tech-layout">
        {branches.map((branch) => {
          const meta = BRANCH_META[branch];
          return (
            <div key={branch}>
              <div className="tech-branch-title">
                <span style={{ width: 8, height: 8, borderRadius: 3, background: meta.color, display: 'inline-block' }} />
                {meta.name}
                <span style={{ marginLeft: 'auto', color: 'var(--dim)', letterSpacing: 0 }}>{grouped[branch].length}</span>
              </div>
              <div className="tech-branch">
                {grouped[branch].map((tech) => {
                  const isResearched = player.techs.includes(tech.id);
                  const missing = tech.requires.filter((r) => !player.techs.includes(r));
                  const cost = techCost(tech, player);
                  const affordable = !isResearched && missing.length === 0 && player.research >= cost;
                  const locked = !isResearched && missing.length > 0;
                  return (
                    <button
                      key={tech.id}
                      className={`tech-node ${isResearched ? 'researched' : ''} ${locked ? 'locked' : ''} ${affordable ? 'affordable' : ''}`}
                      onClick={() => !isResearched && !locked && research(tech.id)}
                      title={locked ? `Requires ${missing.map((m) => TECH_MAP[m].name).join(', ')}` : isResearched ? 'Researched' : affordable ? 'Click to research' : `Need ${Math.ceil(cost - player.research)} more RP`}
                    >
                      <div className="tech-node-top">
                        <span className="tech-node-name">{tech.name}</span>
                        <span className="tech-node-cost">
                          {isResearched ? <Icon name="check" size={12} style={{ color: 'var(--good)' }} /> : `${cost}`}
                        </span>
                      </div>
                      <div className="tech-node-effect">{tech.effect}</div>
                      <div className="tech-node-meta">
                        Tier {tech.tier}
                        {locked ? ` · needs ${missing.map((m) => TECH_MAP[m].name).join(', ')}` : isResearched ? ' · active' : affordable ? ' · ready' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 11, color: 'var(--dim)' }}>
        <span>
          {researched} / {TECHS.length} technologies completed · research gets more expensive as your fleet scales
        </span>
        <span className="chip" style={{ color: 'var(--gold)' }}>
          {number(player.research)} RP banked
        </span>
      </div>
    </ModalShell>
  );
}

/* --------------------------------- Markets -------------------------------- */

function MarketModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  const history = game.history;
  const priceSeries = history.map((h) => h.computePrice);
  const demandSeries = history.map((h) => h.demand);
  const supplySeries = history.map((h) => h.players.reduce((s, p) => s + p.compute, 0));
  const fuel = game.market.events.reduce((m, e) => m * (e.fuelMult ?? 1), 1);
  return (
    <ModalShell
      title="Energy & compute markets"
      subtitle="Compute clears against demand every turn. Power is bought at spot on import and sold at a haircut on export. Batteries arbitrage the gap."
      icon="chart"
      wide
      onClose={onClose}
    >
      <div className="market-grid">
        <div>
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Compute price</div>
              <div className="big-price">
                ${game.market.computePrice.toFixed(2)}
                <small>/CU</small>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Power spot</div>
              <div className="big-price" style={{ fontSize: 26 }}>
                ${game.market.powerPrice.toFixed(2)}
                <small>/MW-turn</small>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)' }}>Compute price history</div>
            {priceSeries.length > 1 ? (
              <Sparkline series={[{ values: priceSeries, color: '#ffd166', label: 'Compute price' }]} height={100} min={0} max={Math.max(...priceSeries) * 1.2} showDots />
            ) : (
              <>
                <Sparkline
                  series={[{ values: Array.from({ length: 26 }, (_, i) => computePriceFor(BALANCE.demandBase, i * 24, BALANCE.computeBase, 1)), color: '#ffd166', label: 'Clearing curve' }]}
                  height={100}
                  min={0}
                />
                <div style={{ fontSize: 10.5, color: 'var(--dim)', marginTop: 4 }}>
                  Market-clearing curve: price falls as fleet supply approaches demand. History appears after the first turn.
                </div>
              </>
            )}
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)' }}>Demand vs fleet supply</div>
            {demandSeries.length > 1 ? (
              <Sparkline
                series={[
                  { values: demandSeries, color: '#7fe6ff', label: 'Demand' },
                  { values: supplySeries, color: '#b794f6', label: 'Supply' },
                ]}
                height={88}
                min={0}
                max={Math.max(...demandSeries, ...supplySeries) * 1.15}
              />
            ) : null}
            <div className="legend">
              <span><i style={{ background: '#ffd166' }} />Compute $/CU</span>
              <span><i style={{ background: '#7fe6ff' }} />Market demand</span>
              <span><i style={{ background: '#b794f6' }} />All-fleet supply</span>
            </div>
          </div>
        </div>
        <div>
          <div className="price-row">
            <span>Demand this turn</span>
            <b>{number(game.market.demand)} <span style={{ fontSize: 10, color: 'var(--dim)' }}>CU</span></b>
          </div>
          <div className="price-row">
            <span>Supply last clear</span>
            <b>{number(game.market.supply)} <span style={{ fontSize: 10, color: 'var(--dim)' }}>CU</span></b>
          </div>
          <div className="price-row">
            <span>Import price</span>
            <b>${(game.market.powerPrice * BALANCE.importUplift).toFixed(2)}</b>
          </div>
          <div className="price-row">
            <span>Export price</span>
            <b>${(game.market.powerPrice * BALANCE.exportHaircut).toFixed(2)}</b>
          </div>
          <div className="price-row">
            <span>Gas fuel multiplier</span>
            <b>×{fuel.toFixed(2)}</b>
          </div>
          <div style={{ marginTop: 10, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)' }}>Next turn weather</div>
          <div className="forecast">
            {game.market.forecast.map((f) => {
              const weather = weatherById(f.weather);
              return (
                <div className="forecast-chip" key={f.weather}>
                  <div style={{ fontWeight: 600 }}>{weather.name}</div>
                  <div style={{ color: 'var(--dim)', fontSize: 10 }}>{f.weight}% · sun {weather.solar.toFixed(2)} · wind {weather.wind.toFixed(2)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)' }}>Active events</div>
          {game.market.events.length === 0 && <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Calm markets. No distortions this turn.</div>}
          {game.market.events.map((event) => (
            <div className="event-card" key={event.id}>
              <div className="event-title">
                <Icon name="warning" size={12} /> {event.label}
                <span style={{ marginLeft: 'auto', opacity: 0.7, fontWeight: 500 }}>{event.turnsLeft}t</span>
              </div>
              <div className="event-desc">{event.desc}</div>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 10.5, color: 'var(--dim)', lineHeight: 1.5 }}>
            Every company sells into the same compute market, so expanding supply lowers the clearing price for everyone. Higher efficiency
            (CU per MW) keeps your margin intact when the price falls.
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/* --------------------------------- Empire --------------------------------- */

function EmpireModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  const saveNow = useGame((s) => s.saveNow);
  const setPolicy = useGame((s) => s.setGlobalPolicy);
  const focus = useGame((s) => s.focusTile);
  const player = game.players[0];
  const report = game.report[0];
  const projected = projection(game);
  const firstTurn = game.history.length === 0;
  const priceMult = game.market.events.reduce((m, e) => m * (e.computePriceMult ?? 1), 1);
  const computeRevenue = firstTurn ? projected.compute * game.market.computePrice * priceMult : report.computeRevenue;
  const powerRevenue = firstTurn ? projected.powerRevenue : report.powerRevenue;
  const powerCost = firstTurn ? projected.powerCost : report.powerCost;
  const fuelCost = firstTurn ? projected.fuelCost : report.fuelCost;
  const maintenance = firstTurn ? projected.maintenance : report.maintenance;
  const net = computeRevenue + powerRevenue - powerCost - fuelCost - maintenance;
  const itMW = firstTurn ? projected.itMW : report.itMW;
  const stability = firstTurn ? projected.stability : report.stability;
  const mix = generatorMix(game);
  const totalMix = mix.reduce((s, m) => s + m.mw, 0) || 1;
  const centers = game.tiles.filter((t) => t.structure?.owner === 0 && STRUCTURES[t.structure.kind].category === 'compute');
  const itCapacity = centers.reduce((sum, t) => sum + STRUCTURES[t.structure!.kind].mw, 0);
  const history = game.history;
  return (
    <ModalShell
      title={`${player.corp} · company report`}
      subtitle="Last resolved turn, plus the live projection for the current build-out."
      icon="grid"
      wide
      onClose={onClose}
    >
      <div className="empire-grid">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ fontSize: 14 }}>Income statement</h3>
            <span style={{ fontSize: 10.5, color: 'var(--dim)' }}>{firstTurn ? 'projected first turn' : `turn ${game.turn - 1}`}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <div className="statement-row">
              <span className="k">Compute revenue</span>
              <span className="v" style={{ color: 'var(--good)' }}>+{money(computeRevenue)}</span>
            </div>
            <div className="statement-row">
              <span className="k">Power & flexibility revenue</span>
              <span className="v" style={{ color: 'var(--good)' }}>+{money(powerRevenue)}</span>
            </div>
            <div className="statement-row">
              <span className="k">Market imports</span>
              <span className="v" style={{ color: 'var(--bad)' }}>-{money(powerCost)}</span>
            </div>
            <div className="statement-row">
              <span className="k">Fuel</span>
              <span className="v" style={{ color: 'var(--bad)' }}>-{money(fuelCost)}</span>
            </div>
            <div className="statement-row">
              <span className="k">Maintenance</span>
              <span className="v" style={{ color: 'var(--bad)' }}>-{money(maintenance)}</span>
            </div>
            <div className="statement-row total">
              <span className="k">Net profit</span>
              <span className="v" style={{ color: net >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                {signed(net, moneyExact)}
              </span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            <div className="stat-box">
              <div className="k">Projected net</div>
              <div className="v" style={{ color: projectedNet(game, projected) >= 0 ? 'var(--good)' : 'var(--bad)' }}>{money(projectedNet(game, projected))}</div>
            </div>
            <div className="stat-box">
              <div className="k">Operating cost</div>
              <div className="v">{money(powerCost + fuelCost + maintenance)}</div>
            </div>
            <div className="stat-box">
              <div className="k">Compute / MW delivered</div>
              <div className="v">
                {(projected.compute / Math.max(1, itMW)).toFixed(2)} <small>CU/MW</small>
              </div>
            </div>
            <div className="stat-box">
              <div className="k">Research</div>
              <div className="v">+{projected.research.toFixed(1)} <small>RP</small></div>
            </div>
          </div>
          {history.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <div className="legend" style={{ marginTop: 0, marginBottom: 2 }}>
                <span><i style={{ background: '#ffd166' }} />Treasury</span>
              </div>
              <Sparkline
                series={[{ values: history.map((h) => h.players[0].credits), color: '#ffd166', label: 'Credits' }]}
                height={54}
                min={0}
                max={Math.max(...history.map((h) => h.players[0].credits)) * 1.1}
              />
              <div className="legend" style={{ marginTop: 4, marginBottom: 2 }}>
                <span><i style={{ background: '#5df0b1' }} />Compute output</span>
              </div>
              <Sparkline
                series={[{ values: history.map((h) => h.players[0].compute), color: '#5df0b1', label: 'Compute' }]}
                height={44}
                min={0}
                max={Math.max(...history.map((h) => h.players[0].compute)) * 1.1}
              />
            </div>
          )}
        </div>
        <div>
          <h3 style={{ fontSize: 14 }}>Generation mix</h3>
          <div style={{ marginTop: 8 }}>
            {mix.length === 0 && <div style={{ fontSize: 11, color: 'var(--dim)' }}>No generation online.</div>}
            {mix.map((row) => (
              <div className="mix-row" key={row.kind}>
                <span className="mix-label">
                  <Icon name={structureIcon(row.kind)} size={12} style={{ color: row.color }} /> {row.label}
                </span>
                <span className="mix-bar">
                  <i style={{ width: `${(row.mw / totalMix) * 100}%`, background: row.color }} />
                </span>
                <span className="mix-value">{number(row.mw)} MW</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            <div className="stat-box">
              <div className="k">Data centers</div>
              <div className="v">{centers.length}</div>
            </div>
            <div className="stat-box">
              <div className="k">Installed IT</div>
              <div className="v">{number(itCapacity)} <small>MW</small></div>
            </div>
            <div className="stat-box">
              <div className="k">Firm generation</div>
              <div className="v">{number(game.victory.progress[0].firmMw)} <small>MW</small></div>
            </div>
            <div className="stat-box">
              <div className="k">Stability</div>
              <div className="v" style={{ color: stabilityColor(stability) }}>{stability.toFixed(0)}%</div>
            </div>
          </div>
          <h3 style={{ fontSize: 14, marginTop: 16 }}>Fleet policy</h3>
          <div className="policy-list" style={{ marginTop: 7 }}>
            {(Object.keys(POLICIES) as (keyof typeof POLICIES)[]).map((id) => (
              <button key={id} className={`policy-option ${player.policy === id ? 'active' : ''}`} onClick={() => setPolicy(id)}>
                <b>{POLICIES[id].name}</b>
                <span>{POLICIES[id].blurb}</span>
              </button>
            ))}
          </div>
          <div className="actions">
            <button className="btn" onClick={() => { saveNow(); }}>
              <Icon name="check" size={14} /> Save game
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                const tile = game.tiles.find((t) => t.owner === 0);
                if (tile) focus(tile.x, tile.y);
                onClose();
              }}
            >
              <Icon name="cursor" size={14} /> Centre empire
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/* --------------------------------- Rivals --------------------------------- */

function RivalsModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  const setModal = useGame((s) => s.setModal);
  const ownReport = projection(game);
  const totalLive = game.players.reduce((sum, p) => sum + (p.id === 0 ? ownReport.compute : projectionFor(game, p.id).compute), 0);
  const ownShare = projectedShare(game, ownReport);
  return (
    <ModalShell
      title="Rival companies"
      subtitle="Three operators with different instincts. Shares are of the shared compute market."
      icon="users"
      wide
      onClose={onClose}
    >
      <div className="rival-grid">
        {game.players.filter((p) => p.isAI).map((rival) => {
          const report = projectionFor(game, rival.id);
          const progress = game.victory.progress[rival.id];
          const liveShare = totalLive > 0 ? report.compute / totalLive : 0;
          const centers = game.tiles.filter((t) => t.structure?.owner === rival.id && STRUCTURES[t.structure.kind].category === 'compute').length;
          return (
            <div className="rival-card" key={rival.id}>
              <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: rival.color }} />
              <div className="rival-name">
                <span style={{ width: 9, height: 9, borderRadius: 3, background: rival.color, display: 'inline-block' }} />
                {rival.corp}
              </div>
              <div className="rival-blurb">
                {rival.persona === 'helios'
                  ? 'Renewable developer. Floods the map with solar and wind, then sells cheap megawatts and hedges with storage.'
                  : rival.persona === 'titan'
                    ? 'Hyperscaler. Builds data centers first and asks forgiveness from the grid later. Chases market share at any margin.'
                    : 'Grid operator at heart. Batteries, demand response and transmission chokepoints. Turns reliability into revenue.'}
              </div>
              <div className="rival-stats">
                <div className="rival-stat">
                  Market share<b>{pct(liveShare)}</b>
                </div>
                <div className="rival-stat">
                  Compute<b>{number(report.compute, 1)} CU</b>
                </div>
                <div className="rival-stat">
                  Treasury<b>{money(rival.credits)}</b>
                </div>
                <div className="rival-stat">
                  Data centers<b>{centers}</b>
                </div>
                <div className="rival-stat">
                  Generation<b>{number(report.generation)} MW</b>
                </div>
                <div className="rival-stat">
                  Stability<b style={{ color: stabilityColor(report.stability) }}>{report.stability.toFixed(0)}%</b>
                </div>
                <div className="rival-stat">
                  Technologies<b>{rival.techs.length}</b>
                </div>
                <div className="rival-stat">
                  Score<b>{number(progress.score)}</b>
                </div>
              </div>
              {rival.bankrupt && <div className="chip bad" style={{ marginTop: 8 }}>Insolvent</div>}
            </div>
          );
        })}
      </div>
      <div className="summary-grid" style={{ marginTop: 18 }}>
        <div className="summary-stat">
          <div className="k">Your share</div>
          <div className="v">{pct(ownShare)}</div>
        </div>
        <div className="summary-stat">
          <div className="k">Market demand</div>
          <div className="v">{number(game.market.demand)} <small>CU</small></div>
        </div>
        <div className="summary-stat">
          <div className="k">Clearing price</div>
          <div className="v">${game.market.computePrice.toFixed(1)}</div>
        </div>
        <div className="summary-stat">
          <div className="k">Turns remaining</div>
          <div className="v">{game.maxTurns - game.turn + 1}</div>
        </div>
      </div>
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={() => setModal('market')}>
          <Icon name="chart" size={14} /> Market detail
        </button>
      </div>
    </ModalShell>
  );
}

/* -------------------------------- Summary --------------------------------- */

function SummaryModal({ onClose }: { onClose: () => void }) {
  const summary = useGame((s) => s.summary)!;
  const game = useGame((s) => s.game)!;
  const setModal = useGame((s) => s.setModal);
  const report = game.report[0];
  const weather = weatherById(summary.weatherId);
  const history = game.history;
  return (
    <ModalShell
      title={`Turn ${summary.turn} resolved`}
      subtitle={`${weather.name} — ${weather.blurb}`}
      icon="clock"
      onClose={onClose}
    >
      <div className="summary-hero">
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Net result</div>
          <div className="big-price" style={{ color: report.net >= 0 ? 'var(--good)' : 'var(--bad)' }}>
            {signed(report.net, moneyExact)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {number(report.compute)} CU sold at ${summary.computePrice.toFixed(2)} · {number(report.served)} MW served
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>Treasury</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>{money(game.players[0].credits)}</div>
          <div style={{ fontSize: 11, color: stabilityColor(report.stability) }}>Stability {report.stability.toFixed(0)}%</div>
        </div>
      </div>
      <div className="summary-grid">
        <div className="summary-stat">
          <div className="k">Generated</div>
          <div className="v">{number(report.generation)} <small>MW</small></div>
        </div>
        <div className="summary-stat">
          <div className="k">Consumed</div>
          <div className="v">{number(report.load)} <small>MW</small></div>
        </div>
        <div className="summary-stat">
          <div className="k">Compute</div>
          <div className="v">{number(report.compute)} <small>CU</small></div>
        </div>
        <div className="summary-stat">
          <div className="k">Research</div>
          <div className="v">+{report.research.toFixed(1)} <small>RP</small></div>
        </div>
        <div className="summary-stat">
          <div className="k">Revenue</div>
          <div className="v">{money(report.computeRevenue + report.powerRevenue)}</div>
        </div>
        <div className="summary-stat">
          <div className="k">Operating cost</div>
          <div className="v">{money(opexOf(report))}</div>
        </div>
        <div className={`summary-stat ${report.net >= 0 ? 'positive' : 'negative'}`}>
          <div className="k">Net</div>
          <div className="v">{money(report.net)}</div>
        </div>
        <div className="summary-stat">
          <div className="k">Market share</div>
          <div className="v">{pct(game.victory.progress[0].computeShare)}</div>
        </div>
      </div>
      {history.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)' }}>Treasury trend</div>
          <Sparkline series={[{ values: history.map((h) => h.players[0].credits), color: '#ffd166', label: 'Treasury' }]} height={70} min={0} max={Math.max(...history.map((h) => h.players[0].credits)) * 1.15} />
        </div>
      )}
      <ul className="highlights">
        {summary.highlights.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
      <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn ghost" onClick={() => setModal('market')}>
          <Icon name="chart" size={14} /> Markets
        </button>
        <button className="btn primary" onClick={onClose}>
          Next turn <Icon name="arrowRight" size={14} />
        </button>
      </div>
    </ModalShell>
  );
}

/* -------------------------------- Victory --------------------------------- */

function VictoryModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  const setModal = useGame((s) => s.setModal);
  const quit = useGame((s) => s.quitToMenu);
  const winner = game.victory.winner;
  const kind = game.victory.kind;
  const playerWon = winner === 0;
  const winTitles: Record<string, string> = {
    compute: 'Compute dominance',
    energy: 'Energy empire',
    tech: 'Technology leadership',
    score: 'Top of the market',
  };
  const title =
    winner === null
      ? 'Company dissolved'
      : playerWon
        ? winTitles[kind ?? 'score'] ?? 'Victory'
        : `${game.players[winner].corp} takes the market`;
  const subtitle =
    winner === null
      ? 'Your treasury fell through the floor and the board pulled the plug.'
      : kind === 'compute'
        ? 'You held the majority of the compute market for three consecutive turns.'
        : kind === 'energy'
          ? 'Firm, reliable generation and an immaculate balance sheet carried the day.'
          : kind === 'tech'
            ? 'The autonomous fleet made your compute the most efficient in the world.'
            : `${playerWon ? 'You' : 'They'} finished the 40-turn campaign with the highest empire score.`;
  const rows = [...game.players].sort((a, b) => game.victory.progress[b.id].score - game.victory.progress[a.id].score);
  return (
    <ModalShell title={playerWon ? 'Victory' : 'Campaign over'} icon="trophy" onClose={onClose}>
      <div className="victory-screen">
        <div className="victory-mark" style={{ color: playerWon ? 'var(--gold)' : 'var(--bad)' }}>
          <Icon name={playerWon ? 'trophy' : 'warning'} size={34} />
        </div>
        <div className="victory-title">{title}</div>
        <div className="victory-sub">{subtitle}</div>
        <div className="victory-scoreboard">
          {rows.map((p) => (
            <div className={`score-row ${p.id === winner ? 'winner' : ''}`} key={p.id}>
              <span className="score-swatch" style={{ background: p.color }} />
              <span>{p.corp}{p.bankrupt ? ' (insolvent)' : ''}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--gold)' }}>{number(game.victory.progress[p.id].score)}</span>
            </div>
          ))}
        </div>
        <div className="actions" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button className="btn primary" onClick={() => setModal('newgame')}>
            <Icon name="play" size={14} /> Play again
          </button>
          <button className="btn ghost" onClick={quit}>
            Main menu
          </button>
          <button className="btn ghost" onClick={onClose}>
            Inspect map
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ---------------------------------- Help ---------------------------------- */

export function HelpContent() {
  return (
    <div className="help-grid">
      <div>
        <h3 style={{ fontSize: 13, marginBottom: 8 }}>The loop</h3>
        {[
          ['Claim land', 'Territory hosts every asset. Claims must border yours and get more expensive with each claim.'],
          ['Generate power', 'Solar and wind are cheap but weather-bound. Gas is dispatchable but burns fuel. Hydro, geothermal and nuclear are firm.'],
          ['Transmit it', 'Assets connect to a substation within 3 tiles. Corridors join substations into one island. Line capacity and substation throughput are real limits.'],
          ['Convert to compute', 'Data centers draw IT power × PUE. Compute = IT × efficiency. It sells at the market clearing price.'],
          ['Research and specialise', 'Efficiency, storage, flexibility and transmission all change the economics. Not every branch is affordable in one run.'],
          ['Win', 'Compute dominance, energy empire or technology leadership before turn 40 — or the highest score at the horizon.'],
        ].map(([title, text], index) => (
          <div className="help-step" key={title}>
            <div className="help-num">{index + 1}</div>
            <div>
              <b>{title}</b>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </div>
      <div>
        <h3 style={{ fontSize: 13, marginBottom: 8 }}>Reading the numbers</h3>
        <div className="help-step">
          <div className="help-num"><Icon name="bolt" size={12} /></div>
          <div>
            <b>Power</b>
            <p>MW generated / MW load. If served &lt; load your racks throttle. Imports cover gaps at a premium; exports sell surplus at a haircut.</p>
          </div>
        </div>
        <div className="help-step">
          <div className="help-num"><Icon name="chip" size={12} /></div>
          <div>
            <b>Compute</b>
            <p>CU per turn. Every company sells into the same market: supply above demand pushes the price down.</p>
          </div>
        </div>
        <div className="help-step">
          <div className="help-num"><Icon name="battery" size={12} /></div>
          <div>
            <b>Storage & flexibility</b>
            <p>Batteries charge from surplus and discharge into load. Grid-flexible data centers earn service payments — big money during grid emergencies.</p>
          </div>
        </div>
        <div className="help-step">
          <div className="help-num"><Icon name="shield" size={12} /></div>
          <div>
            <b>Stability</b>
            <p>Reserve margin over firm capacity, congestion and events. Below 50% output degrades; below 35% it really hurts.</p>
          </div>
        </div>
        <h3 style={{ fontSize: 13, margin: '14px 0 8px' }}>Controls</h3>
        <div className="key-grid">
          <div className="key-row"><span>Pan</span><span>Drag / WASD</span></div>
          <div className="key-row"><span>Zoom</span><span>Scroll / + −</span></div>
          <div className="key-row"><span>Select</span><span>Click</span></div>
          <div className="key-row"><span>Claim tile</span><span>Shift + click</span></div>
          <div className="key-row"><span>End turn</span><span><kbd>Space</kbd></span></div>
          <div className="key-row"><span>Tech tree</span><span><kbd>T</kbd></span></div>
          <div className="key-row"><span>Markets</span><span><kbd>M</kbd></span></div>
          <div className="key-row"><span>Empire</span><span><kbd>E</kbd></span></div>
          <div className="key-row"><span>Rivals</span><span><kbd>R</kbd></span></div>
          <div className="key-row"><span>Cancel</span><span><kbd>Esc</kbd></span></div>
        </div>
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="How to build an empire" subtitle="Five minutes here saves five turns of guessing." icon="help" wide onClose={onClose}>
      <HelpContent />
    </ModalShell>
  );
}

/* --------------------------------- Pause ---------------------------------- */

function PauseModal({ onClose }: { onClose: () => void }) {
  const game = useGame((s) => s.game)!;
  const saveNow = useGame((s) => s.saveNow);
  const quit = useGame((s) => s.quitToMenu);
  const setModal = useGame((s) => s.setModal);
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  return (
    <ModalShell title="Command deck" subtitle={`${game.players[0].corp} · turn ${game.turn} of ${game.maxTurns}`} icon="settings" narrow onClose={onClose}>
      <div className="actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <button className="btn primary" onClick={onClose}>
          <Icon name="play" size={14} /> Resume campaign
        </button>
        <button className="btn" onClick={saveNow}>
          <Icon name="check" size={14} /> Save game
        </button>
        <button className="btn ghost" onClick={() => setModal('help')}>
          <Icon name="help" size={14} /> How to play
        </button>
        <button className="btn ghost" onClick={toggleMute}>
          <Icon name={muted ? 'mute' : 'sound'} size={14} /> {muted ? 'Unmute audio' : 'Mute audio'}
        </button>
        <button className="btn ghost" onClick={() => setModal('newgame')}>
          <Icon name="spark" size={14} /> New company
        </button>
        <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={quit}>
          <Icon name="arrowRight" size={14} /> Abandon to main menu
        </button>
      </div>
      <div style={{ marginTop: 14, fontSize: 10.5, color: 'var(--dim)', textAlign: 'center' }}>
        Progress saves automatically at the end of every turn. Saves live in this browser.
      </div>
    </ModalShell>
  );
}

/* -------------------------------- New game -------------------------------- */

function NewGameModal({ onClose }: { onClose: () => void }) {
  const startGame = useGame((s) => s.startGame);
  const [name, setName] = useState('Lumen Grid');
  const [size, setSize] = useState(20);
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 900000) + 100000));
  return (
    <ModalShell title="Found a new company" subtitle="A fresh procedural grid. Rivals seed at the same time — positions are balanced." icon="spark" narrow onClose={onClose}>
      <div className="menu-field">
        <label>Company name</label>
        <input className="input" value={name} maxLength={22} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="menu-field">
        <label>World size</label>
        <div className="size-options">
          {[14, 18, 20, 24].map((n) => (
            <button key={n} className={size === n ? 'active' : ''} onClick={() => setSize(n)}>
              {n}×{n}
              <span>{n <= 14 ? 'Duel' : n <= 18 ? 'Compact' : n <= 20 ? 'Standard' : 'Epic'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="menu-field">
        <label>World seed</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="input" value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ''))} />
          <button className="btn ghost" onClick={() => setSeed(String(Math.floor(Math.random() * 900000) + 100000))}>
            <Icon name="spark" size={14} />
          </button>
        </div>
      </div>
      <div className="actions" style={{ marginTop: 18 }}>
        <button
          className="btn primary block"
          onClick={() =>
            startGame({
              seed: Number(seed) || 123456,
              size,
              maxTurns: BALANCE.maxTurns,
              playerName: name.trim() || 'Lumen Grid',
            })
          }
        >
          <Icon name="play" size={15} /> Enter the grid
        </button>
      </div>
    </ModalShell>
  );
}
