import { useGame } from '../state/store';
import { Icon, type IconName } from './Icons';
import { cu, money, number, pct } from './format';
import { projectedNet, projectedShare, projection, stabilityColor } from './derive';
import type { GameState } from '../engine/types';

function weatherIcon(id: string): IconName {
  if (id === 'sunny' || id === 'heatwave') return 'sun';
  if (id === 'windy' || id === 'drought') return 'wind';
  if (id === 'rain' || id === 'storm' || id === 'overcast') return 'droplet';
  if (id === 'coldsnap') return 'warning';
  return 'eye';
}

export function TopBar() {
  const game = useGame((s) => s.game);
  const rev = useGame((s) => s.rev);
  const modal = useGame((s) => s.modal);
  const setModal = useGame((s) => s.setModal);
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  if (!game) return null;
  const player = game.players[0];
  const report = projection(game);
  const net = projectedNet(game, report);
  const powerPct = report.load > 0 ? Math.min(1, report.served / report.load) : 1;
  const stability = report.stability;
  const share = projectedShare(game, report);
  const weather = game.weather;

  const buttons: { icon: IconName; label: string; modal: typeof modal; key: string }[] = [
    { icon: 'flask', label: 'Technology (T)', modal: 'tech', key: 'tech' },
    { icon: 'chart', label: 'Markets (M)', modal: 'market', key: 'market' },
    { icon: 'grid', label: 'Empire (E)', modal: 'empire', key: 'empire' },
    { icon: 'users', label: 'Rivals (R)', modal: 'rivals', key: 'rivals' },
  ];

  return (
    <>
      <div className="brand">
        <div className="brand-mark">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 2.5 21 7.4v9.2l-9 4.9-9-4.9V7.4l9-4.9Z" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 6.2 17.6 9.3v5.4L12 17.8l-5.6-3.1V9.3L12 6.2Z" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
            <path d="m12.9 8.1-3.4 4.3h2.6l-.9 3.6 3.4-4.4h-2.6l.9-3.5Z" fill="currentColor" />
          </svg>
        </div>
        <div>
          <div className="brand-name">{player.corp}</div>
          <div className="brand-sub">
            <span>Turn {String(game.turn).padStart(2, '0')}</span>
            <span className="dot-sep" />
            <Icon name={weatherIcon(weather.id)} size={11} />
            <span>{weather.name}</span>
          </div>
        </div>
      </div>

      <div className="resources" data-rev={rev}>
        <div className="pill" title={`Net ${money(net)} this turn if you end now`}>
          <div className="pill-icon" style={{ color: '#ffd166' }}>
            <Icon name="coins" size={17} />
          </div>
          <div>
            <div className="pill-label">
              <span>Credits</span>
              <span className={`pill-delta ${net >= 0 ? 'good' : 'bad'}`}>{net >= 0 ? '+' : ''}{money(net)}</span>
            </div>
            <div className="pill-value">{money(player.credits)}</div>
          </div>
        </div>

        <div className="pill" title={`${report.generation.toFixed(0)} MW generated · ${report.load.toFixed(0)} MW load · ${report.imported.toFixed(0)} MW imported`}>
          <div className="pill-icon" style={{ color: '#7fe6ff' }}>
            <Icon name="bolt" size={17} />
          </div>
          <div>
            <div className="pill-label">
              <span>Power</span>
              <span style={{ color: report.imported > 1 ? '#ff9f5c' : '#8fa6b8' }}>{number(report.generation)}/{number(report.load)} MW</span>
            </div>
            <div className="pill-value">
              {number(report.served)}
              <span className="unit">MW SERVED</span>
            </div>
            <div className="mini-bar">
              <i style={{ width: `${powerPct * 100}%`, background: report.imported > report.load * 0.2 ? 'linear-gradient(90deg,#ffb35c,#ff7a59)' : 'linear-gradient(90deg,#3fd8c2,#7fe6ff)' }} />
            </div>
          </div>
        </div>

        <div className="pill" title="Compute delivered per turn, priced by the market">
          <div className="pill-icon" style={{ color: '#5df0b1' }}>
            <Icon name="chip" size={17} />
          </div>
          <div>
            <div className="pill-label">
              <span>Compute</span>
              <span>{pct(share)} share</span>
            </div>
            <div className="pill-value">
              {number(report.compute)}
              <span className="unit">CU</span>
            </div>
          </div>
        </div>

        <div className="pill" title={`${report.research.toFixed(1)} research per turn`}>
          <div className="pill-icon" style={{ color: '#b794f6' }}>
            <Icon name="flask" size={17} />
          </div>
          <div>
            <div className="pill-label">
              <span>Research</span>
              <span style={{ color: '#5df0b1' }}>+{report.research.toFixed(1)}</span>
            </div>
            <div className="pill-value">
              {number(player.research)}
              <span className="unit">RP</span>
            </div>
          </div>
        </div>

        <div className="pill" title="Minimum stability across your grid islands">
          <div className="pill-icon" style={{ color: stabilityColor(stability) }}>
            <Icon name="shield" size={17} />
          </div>
          <div>
            <div className="pill-label">
              <span>Stability</span>
              <span style={{ color: stabilityColor(stability) }}>{stability < 50 ? 'low' : stability < 75 ? 'tight' : 'ok'}</span>
            </div>
            <div className="pill-value">
              {stability.toFixed(0)}
              <span className="unit">%</span>
            </div>
            <div className="mini-bar">
              <i style={{ width: `${stability}%`, background: stabilityColor(stability) }} />
            </div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        {buttons.map((b) => (
          <button
            key={b.key}
            className={`icon-btn ${modal === b.modal ? 'active' : ''}`}
            title={b.label}
            aria-label={b.label}
            onClick={() => setModal(modal === b.modal ? null : b.modal)}
          >
            <Icon name={b.icon} size={18} />
          </button>
        ))}
        <span style={{ width: 1, background: 'var(--border)', margin: '4px 2px' }} />
        <button className={`icon-btn ${muted ? '' : 'active'}`} title={muted ? 'Unmute' : 'Mute'} aria-label="Sound" onClick={toggleMute}>
          <Icon name={muted ? 'mute' : 'sound'} size={18} />
        </button>
        <button className="icon-btn" title="How to play (H)" aria-label="Help" onClick={() => setModal('help')}>
          <Icon name="help" size={18} />
        </button>
        <button className="icon-btn" title="Menu" aria-label="Menu" onClick={() => setModal('pause')}>
          <Icon name="menu" size={18} />
        </button>
      </div>
    </>
  );
}

export function turnLabel(game: GameState): string {
  return `Turn ${game.turn} of ${game.maxTurns}`;
}

export { cu };
