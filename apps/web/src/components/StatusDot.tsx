import type { State } from '../types/dashboard';
export function StatusDot({ state }: { state: State }) {
  return <span className={`status-dot ${state}`} />;
}
