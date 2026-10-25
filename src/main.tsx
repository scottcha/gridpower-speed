import { createRoot } from 'react-dom/client';
import App from './App';
import { useGame } from './state/store';
import { getActiveRenderer } from './render/renderer';
import './styles.css';

interface DevBridge {
  useGame: typeof useGame;
  renderer: () => ReturnType<typeof getActiveRenderer>;
  version: string;
}

if (import.meta.env.DEV) {
  const devWindow: Window & { __gp?: DevBridge } = window;
  devWindow.__gp = { useGame, renderer: getActiveRenderer, version: '1.0.0' };
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(<App />);
