import { useGame } from '../state/store';
import { Icon } from './Icons';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div className={`toast ${toast.kind}`} key={toast.id} onClick={() => dismiss(toast.id)}>
          <Icon name={toast.kind === 'bad' ? 'warning' : toast.kind === 'good' ? 'check' : 'spark'} size={13} />
          {toast.text}
        </div>
      ))}
    </div>
  );
}
