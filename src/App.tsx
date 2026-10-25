import { useGame } from './state/store';
import { GameView } from './ui/GameView';
import { MainMenu } from './ui/MainMenu';

export default function App() {
  const screen = useGame((s) => s.screen);
  return <div className="app">{screen === 'game' ? <GameView /> : <MainMenu />}</div>;
}
