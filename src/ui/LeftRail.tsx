import { useGame } from '../state/store';
import { BALANCE } from '../engine/config';
import { Icon } from './Icons';
import { Minimap } from './Minimap';
import { money, number, pct } from './format';
import { nextObjectives, projection } from './derive';

const VICTORY = BALANCE.victory;

export function LeftRail() {
  const game = useGame((s) => s.game);
  const rev = useGame((s) => s.rev);
  const overlay = useGame((s) => s.overlay);
  const setOverlay = useGame((s) => s.setOverlay);
  const objectivesOpen = useGame((s) => s.objectivesOpen);
  const toggleObjectives = useGame((s) => s.toggleObjectives);
  if (!game) return null;
  const progress = game.victory.progress[0];
  const report = projection(game);
  const objectives = nextObjectives(game);

  const computeProgress = Math.min(1, progress.computeShare / VICTORY.computeShare);
  const energyProgress = Math.min(
    1,
    Math.min(progress.firmMw / VICTORY.firmMw, progress.minStability / VICTORY.stability, game.players[0].credits / VICTORY.credits),
  );
  const techProgress = Math.min(1, (progress.techComplete ? 0.55 : 0) + progress.efficientCompute / VICTORY.efficientCompute);

  return (
    <div className="rail left" data-rev={rev}>
      <div className="card">
        <div className="card-head">
          <div className="card-title">
            <Icon name="trophy" size={13} /> Victory progress
          </div>
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>
            {game.victory.over
              ? 'Campaign complete'
              : game.maxTurns - game.turn + 1 === 1
                ? 'final turn'
                : `${game.maxTurns - game.turn + 1} turns left`}
          </span>
        </div>
        <div className="card-body">
          <div className="victory-row">
            <div className="victory-top">
              <span className="victory-name">
                <Icon name="chip" size={12} style={{ color: '#5df0b1' }} /> Compute dominance
              </span>
              <span className="victory-value">
                {pct(progress.computeShare)} / {pct(VICTORY.computeShare)}
              </span>
            </div>
            <div className="victory-bar">
              <i style={{ width: `${computeProgress * 100}%`, background: 'linear-gradient(90deg,#2bb7a6,#5df0b1)' }} />
            </div>
            <div className="victory-note">
              Hold {pct(VICTORY.computeShare)} market share for {VICTORY.computeTurns} turns · streak {progress.computeStreak}/{VICTORY.computeTurns}
            </div>
          </div>
          <div className="victory-row">
            <div className="victory-top">
              <span className="victory-name">
                <Icon name="bolt" size={12} style={{ color: '#7fe6ff' }} /> Energy empire
              </span>
              <span className="victory-value">
                {number(progress.firmMw)} / {VICTORY.firmMw} MW firm
              </span>
            </div>
            <div className="victory-bar">
              <i style={{ width: `${energyProgress * 100}%`, background: 'linear-gradient(90deg,#3d8fbd,#7fe6ff)' }} />
            </div>
            <div className="victory-note">
              Firm capacity, {VICTORY.stability}% stability and {money(VICTORY.credits)} held {VICTORY.energyTurns} turns · {progress.energyStreak}/{VICTORY.energyTurns}
            </div>
          </div>
          <div className="victory-row">
            <div className="victory-top">
              <span className="victory-name">
                <Icon name="spark" size={12} style={{ color: '#b794f6' }} /> Technology leadership
              </span>
              <span className="victory-value">{progress.techComplete ? 'Fleet online' : 'Autonomous fleet'}</span>
            </div>
            <div className="victory-bar">
              <i style={{ width: `${techProgress * 100}%`, background: 'linear-gradient(90deg,#6b4dc7,#b794f6)' }} />
            </div>
            <div className="victory-note">
              Research Autonomous Fleet, then sustain {VICTORY.efficientCompute} CU at 1.3+ CU/MW · {progress.techStreak}/{VICTORY.techTurns}
            </div>
          </div>
          <div className="victory-row score-row">
            <span className="victory-name">
              <Icon name="target" size={12} style={{ color: '#ffd166' }} /> Empire score
            </span>
            <span className="victory-value" style={{ color: 'var(--gold)', fontSize: 13 }}>
              {number(progress.score)}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">
            <Icon name="map" size={13} /> Grid survey
          </div>
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>{number(report.generation)} MW online</span>
        </div>
        <div className="card-body">
          <Minimap />
          <div style={{ marginTop: 10 }} className="seg">
            <button className={overlay === 'none' ? 'active' : ''} onClick={() => setOverlay('none')} title="Standard view">
              <Icon name="eye" size={12} /> All
            </button>
            <button className={overlay === 'power' ? 'active' : ''} onClick={() => setOverlay('power')}>
              <Icon name="bolt" size={12} /> Power
            </button>
            <button className={overlay === 'compute' ? 'active' : ''} onClick={() => setOverlay('compute')}>
              <Icon name="chip" size={12} /> CU
            </button>
            <button className={overlay === 'territory' ? 'active' : ''} onClick={() => setOverlay('territory')}>
              <Icon name="flag" size={12} /> Land
            </button>
            <button className={overlay === 'economy' ? 'active' : ''} onClick={() => setOverlay('economy')}>
              <Icon name="layers" size={12} /> Sites
            </button>
            <button
              title="Recentre on your grid"
              onClick={() => {
                const sub = game.tiles.find((t) => t.structure?.kind === 'substation' && t.structure.owner === 0);
                if (sub) useGame.getState().focusTile(sub.x, sub.y);
              }}
            >
              <Icon name="cursor" size={12} /> Find
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">
            <Icon name="target" size={13} /> Next moves
          </div>
          <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={toggleObjectives} title="Toggle hints">
            <Icon name={objectivesOpen ? 'minus' : 'plus'} size={13} />
          </button>
        </div>
        {objectivesOpen && (
          <div className="card-body">
            {objectives.map((objective, index) => (
              <div className="objective" key={index}>
                <div className="bullet">
                  <Icon name={objective.icon} size={12} />
                </div>
                <div>
                  <div className="objective-text">
                    <b>{objective.title}</b>
                  </div>
                  <div className="objective-hint">{objective.hint}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
