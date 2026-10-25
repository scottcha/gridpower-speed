import { useState } from 'react';
import { BALANCE } from '../engine/config';
import type { GameSetup } from '../engine/types';
import { Icon } from './Icons';

export function StartForm({ onStart }: { onStart: (setup: Omit<GameSetup, 'credits'>) => void }) {
  const [name, setName] = useState('Lumen Grid');
  const [size, setSize] = useState(20);
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 900000) + 100000));

  return (
    <div>
      <div className="menu-field">
        <label>Company name</label>
        <input className="input" value={name} maxLength={22} onChange={(e) => setName(e.target.value)} placeholder="Lumen Grid" />
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
          <input
            className="input"
            inputMode="numeric"
            value={seed}
            onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="123456"
          />
          <button className="btn ghost" onClick={() => setSeed(String(Math.floor(Math.random() * 900000) + 100000))} title="Random seed">
            <Icon name="spark" size={14} />
          </button>
        </div>
      </div>
      <button
        className="btn primary block"
        style={{ marginTop: 18, padding: 12, fontSize: 13 }}
        onClick={() =>
          onStart({
            seed: Number(seed) || 123456,
            size,
            maxTurns: BALANCE.maxTurns,
            playerName: name.trim() || 'Lumen Grid',
          })
        }
      >
        <Icon name="play" size={15} /> Enter the grid
      </button>
      <div style={{ marginTop: 9, fontSize: 10, color: 'var(--dim)', textAlign: 'center' }}>
        Deterministic seed · three AI rivals · autosaves every turn
      </div>
    </div>
  );
}
