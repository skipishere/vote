import type { VoteValue } from '../types';
import { formatTime } from '../utils';
import ballotHtmlRaw from './ballot.html?raw';
import timerHtmlRaw from './timer.html?raw';

export function setVoteHighlight(container: HTMLElement, selected: VoteValue | null): void {
  container.querySelectorAll('.ballot button').forEach((btn) =>
    btn.classList.toggle('selected', btn.getAttribute('data-value') === selected)
  );
  container.querySelector('#ballot')?.classList.toggle('has-selection', selected !== null);
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
  el.textContent = label;
}

export function showError(container: HTMLElement, msg: string): void {
  const el = container.querySelector<HTMLElement>('#error-msg')!;
  el.innerHTML = msg;
  el.hidden = false;
}

export const ballotHtml = ballotHtmlRaw;

export const timerHtml = timerHtmlRaw;

export function applyWinnerHighlight(container: HTMLElement, winner: 'up' | 'down', show: boolean): void {
  ['option-up', 'option-neutral', 'option-down'].forEach(id =>
    container.querySelector(`#${id}`)?.classList.remove('winner')
  );
  container.querySelector('#ballot')?.classList.toggle('has-winner', show);
  if (show) container.querySelector(`#option-${winner}`)?.classList.add('winner');
}
