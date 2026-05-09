export function tallyGridHtml(disabled: boolean, initialCount: string): string {
  const dis = disabled ? ' disabled' : '';
  return `
              <div class="tally-grid" id="tally-grid">
                <button class="tally-card up tally-btn" id="tally-card-up" data-value="up"${dis} accesskey="1">
                  <div class="tally-icon">👍</div>
                  <div class="tally-count" id="tally-up">${initialCount}</div>
                  <div class="tally-label">Continue</div>
                </button>
                <button class="tally-card neutral tally-btn" id="tally-card-neutral" data-value="sideways"${dis} accesskey="2">
                  <div class="tally-icon">✊</div>
                  <div class="tally-count" id="tally-neutral">${initialCount}</div>
                  <div class="tally-label">Either way</div>
                </button>
                <button class="tally-card down tally-btn" id="tally-card-down" data-value="down"${dis} accesskey="3">
                  <div class="tally-icon">👎</div>
                  <div class="tally-count" id="tally-down">${initialCount}</div>
                  <div class="tally-label">Move on</div>
                </button>
              </div>`;
}

/** Generates the timer countdown box used by both host and participant views. */
export function timerBoxHtml(boxId: string, countdownId: string): string {
  return `
              <div id="${boxId}" class="timer-compact hidden">
                <span class="timer-compact-label">⏱ Time remaining</span>
                <span id="${countdownId}" class="timer-countdown">0:00</span>
              </div>`;
}

export function setStatus(container: HTMLElement, cls: string, label: string): void {
  const el = container.querySelector('#conn-status')!;
  el.className = `status-chip status-${cls}`;
  el.innerHTML = `<span class="dot"></span>${label}`;
}

export function showError(container: HTMLElement, msg: string): void {
  const el = container.querySelector<HTMLElement>('#error-msg')!;
  el.innerHTML = msg;
  el.classList.remove('hidden');
}
