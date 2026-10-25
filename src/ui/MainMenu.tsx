import { useGame } from '../state/store';
import { BALANCE } from '../engine/config';
import { Icon } from './Icons';
import { StartForm } from './StartForm';
import { saveSummary } from '../engine/save';
import { timeAgo } from './format';
import { HelpContent } from './Modals';
import { useState } from 'react';

const MENU_NODES = [
  { x: 210, y: 510, color: '#3fd8c2' },
  { x: 360, y: 590, color: '#f5a524' },
  { x: 510, y: 500, color: '#ff5d8f' },
  { x: 240, y: 360, color: '#3fd8c2' },
  { x: 380, y: 430, color: '#8f7bff' },
  { x: 300, y: 190, color: '#3fd8c2' },
  { x: 430, y: 250, color: '#f5a524' },
  { x: 560, y: 190, color: '#8f7bff' },
];

export function MainMenu() {
  const startGame = useGame((s) => s.startGame);
  const continueGame = useGame((s) => s.continueGame);
  const save = saveSummary();
  const [tab, setTab] = useState<'new' | 'help'>('new');

  return (
    <div className="menu">
      <div className="menu-grid" />
      <div className="menu-art" aria-hidden="true">
        <svg viewBox="0 0 640 720" fill="none">
          <defs>
            <linearGradient id="wire" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3fd8c2" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#4a8fd8" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          <g stroke="url(#wire)" strokeWidth="1.2">
            <path d="M60 600 210 510 360 590 510 500 620 560" />
            <path d="M120 430 240 360 380 430 520 350" />
            <path d="M180 250 300 190 430 250 560 190" />
            <path d="M210 510 240 360M360 590 380 430M510 500 520 350M240 360 300 190M380 430 430 250" />
            <path className="pulse" strokeDasharray="6 14" d="M60 600 210 510 360 590 510 500 620 560" />
            <path className="pulse" strokeDasharray="4 12" d="M180 250 300 190 430 250 560 190" />
          </g>
          {MENU_NODES.map((node, i) => (
            <g key={i}>
              <circle cx={node.x} cy={node.y} r="18" fill={node.color} opacity="0.07" />
              <circle cx={node.x} cy={node.y} r="5" fill={node.color} opacity="0.9" />
              <circle cx={node.x} cy={node.y} r="10" stroke={node.color} strokeWidth="0.8" opacity="0.4" />
            </g>
          ))}
          <g opacity="0.5">
            <path d="M84 646 210 574 336 646 210 718 84 646Z" stroke="#3fd8c2" strokeWidth="0.8" opacity="0.35" />
            <path d="M336 646 462 574 588 646 462 718 336 646Z" stroke="#3fd8c2" strokeWidth="0.8" opacity="0.2" />
          </g>
        </svg>
      </div>

      <div className="menu-inner">
        <div>
          <div className="menu-kicker">A 4X of megawatts and machine intelligence</div>
          <h1 className="menu-title">GRID<br />POWER</h1>
          <div className="menu-tag">Build the grid. Control the compute. Dominate the future.</div>
          <p className="menu-blurb">
            Four AI infrastructure companies. One strained electrical grid. Claim territory, build generation, string transmission corridors
            through the hills, and turn delivered megawatts into the compute the world is bidding for.
          </p>
          <div className="menu-stat-row">
            <div className="menu-stat">
              <b>40</b>
              <span>turn campaign</span>
            </div>
            <div className="menu-stat">
              <b>6</b>
              <span>generation techs</span>
            </div>
            <div className="menu-stat">
              <b>3</b>
              <span>rival strategies</span>
            </div>
            <div className="menu-stat">
              <b>21</b>
              <span>technologies</span>
            </div>
          </div>
          <div className="menu-features">
            <span className="menu-feature"><Icon name="grid" size={13} /> Procedural worlds</span>
            <span className="menu-feature"><Icon name="bolt" size={13} /> Transmission bottlenecks</span>
            <span className="menu-feature"><Icon name="battery" size={13} /> Storage arbitrage</span>
            <span className="menu-feature"><Icon name="chart" size={13} /> Dynamic markets</span>
          </div>
        </div>

        <div className="menu-card">
          <div className="menu-tabs">
            <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>New company</button>
            <button className={tab === 'help' ? 'active' : ''} onClick={() => setTab('help')}>How to play</button>
          </div>
          {tab === 'new' ? (
            <>
              <h2>Found your company</h2>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {BALANCE.startCredits} starting credits · one data center · one substation · one solar farm.
              </div>
              {save.exists && (
                <div className="save-badge">
                  <span style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <Icon name="clock" size={12} /> {save.playerName} · turn {save.turn}
                  </span>
                  <button className="btn small" onClick={continueGame}>Continue</button>
                </div>
              )}
              <StartForm onStart={startGame} />
            </>
          ) : (
            <div style={{ maxHeight: '62vh', overflow: 'auto', paddingRight: 4 }}>
              <HelpContent />
            </div>
          )}
          <div className="menu-foot">
            Runs fully offline · saves in this browser · {save.exists ? `last save ${timeAgo(save.savedAt)}` : 'no save yet'}
          </div>
        </div>
      </div>
    </div>
  );
}
