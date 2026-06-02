import { formatTime, getSirenEnabled, setSirenEnabled } from '../utils';
import timerHtmlRaw from './timer.html?raw';
import settingsPanelHtmlRaw from './settings-panel.html?raw';
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

export function showError(container: HTMLElement, msg: string, link?: { text: string; href: string }): void {
  const el = container.querySelector<HTMLElement>('#error-msg')!;
  el.textContent = msg;
  if (link) {
    el.append(' ');
    const a = document.createElement('a');
    a.href = link.href;
    a.textContent = link.text;
    el.appendChild(a);
  }
  el.hidden = false;
}

export function hideError(container: HTMLElement): void {
  const el = container.querySelector<HTMLElement>('#error-msg')!;
  el.hidden = true;
}

export const timerHtml = timerHtmlRaw;

export function createTimerController(container: HTMLElement, onExpire?: () => void) {
  const box = container.querySelector<HTMLElement>('#timer-running-box')!;
  const display = container.querySelector<HTMLElement>('#timer-running-box span:last-child')!;
  const sirenAudio = new Audio('/audio/bbc_sirens---b_07027201.mp3');
  let interval: ReturnType<typeof setInterval> | null = null;

  function stop() {
    if (interval !== null) { clearInterval(interval); interval = null; }
    box.hidden = true;
  }

  function startAt(endsAt: number) {
    stop();
    box.hidden = false;
    tickTimerEl(display, endsAt);
    interval = setInterval(() => {
      if (tickTimerEl(display, endsAt)) {
        stop();
        if (getSirenEnabled()) sirenAudio.play().catch(() => {});
        onExpire?.();
      }
    }, 500);
  }

  return { startAt, stop };
}

export function createSettingsController(container: HTMLElement) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = settingsPanelHtmlRaw;
  container.appendChild(wrapper.firstElementChild!);

  const backdrop = container.querySelector<HTMLElement>('#settings-backdrop')!;
  const checkbox = container.querySelector<HTMLInputElement>('#siren-enabled')!;

  checkbox.checked = getSirenEnabled();
  checkbox.addEventListener('change', () => setSirenEnabled(checkbox.checked));

  container.querySelector('#settings-close-btn')!.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  function open()  { backdrop.hidden = false; }
  function close() { backdrop.hidden = true; }

  return { open, close };
}

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
