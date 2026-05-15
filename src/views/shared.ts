import { formatTime } from '../utils';
import timerHtmlRaw from './timer.html?raw';
import { VOTE_TYPES } from '../voteTypes';

export function setVoteHighlight(container: HTMLElement, selected: string | null): void {
  container.querySelectorAll<HTMLButtonElement>('.ballot:not([hidden]) button').forEach(btn =>
    btn.classList.toggle('selected', btn.getAttribute('data-value') === selected)
  );
  const activeBallot = container.querySelector<HTMLElement>('.ballot:not([hidden])');
  activeBallot?.classList.toggle('has-selection', selected !== null);
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

export const timerHtml = timerHtmlRaw;

export function injectBallots(container: HTMLElement): void {
  const ballotSlot = container.querySelector<HTMLElement>('#ballot-slot')!;
  const ballotContainer = document.createElement('div');
  VOTE_TYPES.forEach((vt, i) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = vt.ballotHtml;
    const ballot = tmp.firstElementChild as HTMLElement;
    if (i !== 0) ballot.hidden = true;
    ballotContainer.appendChild(ballot);
  });
  ballotSlot.replaceWith(ballotContainer);
}

export function showActiveBallot(container: HTMLElement, voteTypeId: string): void {
  VOTE_TYPES.forEach(vt => {
    const el = container.querySelector<HTMLElement>(`#ballot-${vt.id}`);
    if (el) el.hidden = vt.id !== voteTypeId;
  });
}
