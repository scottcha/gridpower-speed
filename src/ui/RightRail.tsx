import { useGame } from '../state/store';
import { BALANCE } from '../engine/config';
import { weatherById } from '../engine/markets';
import { Icon, type IconName } from './Icons';
import { number } from './format';
import { Sparkline } from './Sparkline';
import { TilePanel } from './TilePanel';
import type { LogKind } from '../engine/types';

const LOG_ICONS: Record<LogKind, IconName> = {
  build: 'grid',
  claim: 'flag',
  research: 'flask',
  market: 'coins',
  weather: 'eye',
  rival: 'users',
  victory: 'trophy',
  warn: 'warning',
  grid: 'link',
};

export function RightRail() {
  const selected = useGame((s) => s.selected);
  const rev = useGame((s) => s.rev);
  return (
    <div className="rail right" data-rev={rev}>
      {selected ? <TilePanel /> : <MarketPanel />}
      <LogCard />
    </div>
  );
}

export function MarketPanel() {
  const game = useGame((s) => s.game);
  const rev = useGame((s) => s.rev);
  const setModal = useGame((s) => s.setModal);
  if (!game) return null;
  const history = game.history;
  const priceSeries = history.slice(-16).map((h) => h.computePrice);
  const previous = history.length > 1 ? history[history.length - 2].computePrice : game.market.computePrice;
  const delta = game.market.computePrice - previous;
  const utilization = game.market.demand > 0 ? Math.min(1.6, game.market.supply / game.market.demand) : 0;
  const forecast = game.market.forecast;

  return (
    <div className="card" data-rev={rev}>
      <div className="card-head">
        <div className="card-title">
          <Icon name="coins" size={13} /> Wholesale markets
        </div>
        <button className="btn ghost small" onClick={() => setModal('market')}>
          Detail
        </button>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>
              Compute clearing price
            </div>
            <div className="big-price" style={{ fontSize: 30 }}>
              ${game.market.computePrice.toFixed(2)}
              <small>/CU</small>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={`pill-delta ${delta >= 0 ? 'good' : 'bad'}`}>
              {delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(2)}
            </div>
            <div className="price-sub">last turn</div>
          </div>
        </div>

        {priceSeries.length > 1 ? (
          <>
            <Sparkline
              series={[{ values: priceSeries, color: '#ffd166', label: 'Compute price', fill: true }]}
              height={48}
              min={0}
              max={Math.max(...priceSeries) * 1.18}
              showDots
            />
          </>
        ) : (
          <div style={{ height: 72, display: 'grid', placeItems: 'center', color: 'var(--dim)', fontSize: 11 }}>
            Price history appears after your first turn
          </div>
        )}

        <div className="price-row">
          <span>Power spot</span>
          <b>${game.market.powerPrice.toFixed(2)}<span style={{ fontSize: 10, color: 'var(--dim)' }}> /MW-turn</span></b>
        </div>
        <div className="price-row">
          <span>Import / export</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            ${(game.market.powerPrice * BALANCE.importUplift).toFixed(2)} · ${(game.market.powerPrice * BALANCE.exportHaircut).toFixed(2)}
          </span>
        </div>
        <div className="price-row">
          <span>Market demand</span>
          <span style={{ fontSize: 12 }}>
            {number(game.market.demand)} <span style={{ color: 'var(--dim)' }}>/ {number(game.market.supply)} supplied</span>
          </span>
        </div>
        <div className="mini-bar" style={{ marginTop: 2 }}>
          <i
            style={{
              width: `${Math.min(100, utilization * 100)}%`,
              background: utilization > 1 ? 'linear-gradient(90deg,#ffb35c,#ff7a59)' : 'linear-gradient(90deg,#3fd8c2,#7fd6ff)',
            }}
          />
        </div>
        <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>
          {utilization > 1.05 ? 'Oversupplied — prices compress' : utilization < 0.6 ? 'Scarce compute — premium pricing' : 'Balanced market'}
        </div>

        <div style={{ marginTop: 10, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--dim)' }}>
          Next turn forecast
        </div>
        <div className="forecast">
          {forecast.map((f) => {
            const weather = weatherById(f.weather);
            return (
              <div className="forecast-chip" key={f.weather}>
                <div style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                  <span>{weather.name}</span>
                  <span className="pct">{f.weight}%</span>
                </div>
                <div style={{ color: 'var(--dim)', fontSize: 10, marginTop: 2 }}>
                  Sun ×{weather.solar.toFixed(2)} · Wind ×{weather.wind.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>

        {game.market.events.slice(0, 2).map((event) => (
          <div className="event-card" key={event.id}>
            <div className="event-title">
              <Icon name="warning" size={12} /> {event.label}
              <span style={{ marginLeft: 'auto', opacity: 0.7, fontWeight: 500 }}>{event.turnsLeft} turn{event.turnsLeft === 1 ? '' : 's'}</span>
            </div>
            <div className="event-desc">{event.desc}</div>
          </div>
        ))}


      </div>
    </div>
  );
}

export function LogCard() {
  const game = useGame((s) => s.game);
  const rev = useGame((s) => s.rev);
  if (!game) return null;
  const entries = game.log.slice(-7).reverse();
  return (
    <div className="card" data-rev={rev}>
      <div className="card-head">
        <div className="card-title">
          <Icon name="clock" size={13} /> Event log
        </div>
      </div>
      <div className="card-body" style={{ paddingTop: 0 }}>
        {entries.map((entry, index) => (
          <div className={`log-entry ${entry.kind === 'warn' ? 'warn' : ''}`} key={`${entry.turn}-${index}-${entry.text.slice(0, 12)}`}>
            <span className="log-turn">T{entry.turn}</span>
            <Icon name={LOG_ICONS[entry.kind]} size={11} style={{ flex: 'none', marginTop: 2, color: entry.playerId === 0 ? 'var(--accent)' : 'var(--dim)' }} />
            <span>{entry.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
