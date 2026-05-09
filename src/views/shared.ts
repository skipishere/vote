import type { VoteValue } from '../types';
import { formatTime } from '../utils';

export function setVoteHighlight(container: HTMLElement, selected: VoteValue | null): void {
  container.querySelectorAll('.tally-grid button').forEach((btn) =>
    btn.classList.toggle('selected', btn.getAttribute('data-value') === selected)
  );
  container.querySelector('#tally-grid')?.classList.toggle('has-selection', selected !== null);
}

export function tickTimerEl(el: HTMLElement, endsAt: number): boolean {
  const remaining = endsAt - Date.now();
  el.textContent = formatTime(remaining);
  el.classList.toggle('urgent', remaining <= 10_000 && remaining > 0);
  return remaining <= 0;
}

export function setStatus(container: HTMLElement, cls: string, label: string): void {
  const el = container.querySelector('#conn-status')!;
  el.className = `status-chip status-${cls}`;
  el.innerHTML = `<span></span>${label}`;
}

export function showError(container: HTMLElement, msg: string): void {
  const el = container.querySelector<HTMLElement>('#error-msg')!;
  el.innerHTML = msg;
  el.hidden = false;
}
