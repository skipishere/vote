import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTimerController, showError, tickTimerEl, setStatus, setVoteHighlight } from '../views/shared';

function makeTimerContainer() {
  const div = document.createElement('div');
  div.innerHTML = `<div id="timer-running-box" hidden><span>Time remaining</span><span>0:00</span></div>`;
  return div;
}

function makeErrorContainer() {
  const div = document.createElement('div');
  div.innerHTML = `<div id="error-msg" hidden></div>`;
  return div;
}

// ── createTimerController ──────────────────────────────────────────────────

describe('createTimerController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('leaves the box hidden on creation', () => {
    const c = makeTimerContainer();
    createTimerController(c);
    expect(c.querySelector<HTMLElement>('#timer-running-box')!.hidden).toBe(true);
  });

  it('shows the box when startAt is called', () => {
    const c = makeTimerContainer();
    const timer = createTimerController(c);
    timer.startAt(Date.now() + 60_000);
    expect(c.querySelector<HTMLElement>('#timer-running-box')!.hidden).toBe(false);
  });

  it('displays the initial time immediately on startAt', () => {
    const c = makeTimerContainer();
    const timer = createTimerController(c);
    timer.startAt(Date.now() + 60_000);
    expect(c.querySelector('#timer-running-box span:last-child')!.textContent).toBe('1:00');
  });

  it('hides the box on stop', () => {
    const c = makeTimerContainer();
    const timer = createTimerController(c);
    timer.startAt(Date.now() + 60_000);
    timer.stop();
    expect(c.querySelector<HTMLElement>('#timer-running-box')!.hidden).toBe(true);
  });

  it('calls onExpire when the timer elapses', () => {
    const onExpire = vi.fn();
    const c = makeTimerContainer();
    createTimerController(c, onExpire).startAt(Date.now() + 1_000);
    vi.advanceTimersByTime(1_500);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it('hides the box after expiry', () => {
    const c = makeTimerContainer();
    createTimerController(c, vi.fn()).startAt(Date.now() + 1_000);
    vi.advanceTimersByTime(1_500);
    expect(c.querySelector<HTMLElement>('#timer-running-box')!.hidden).toBe(true);
  });

  it('does not call onExpire more than once', () => {
    const onExpire = vi.fn();
    const c = makeTimerContainer();
    createTimerController(c, onExpire).startAt(Date.now() + 1_000);
    vi.advanceTimersByTime(5_000);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it('restarts cleanly when startAt is called again', () => {
    const onExpire = vi.fn();
    const c = makeTimerContainer();
    const timer = createTimerController(c, onExpire);
    timer.startAt(Date.now() + 1_000);
    vi.advanceTimersByTime(500);
    timer.startAt(Date.now() + 1_000); // restart
    vi.advanceTimersByTime(1_500);
    expect(onExpire).toHaveBeenCalledOnce();
  });
});

// ── showError ─────────────────────────────────────────────────────────────

describe('showError', () => {
  it('makes the error element visible', () => {
    const c = makeErrorContainer();
    showError(c, 'Something went wrong');
    expect(c.querySelector<HTMLElement>('#error-msg')!.hidden).toBe(false);
  });

  it('sets the message text', () => {
    const c = makeErrorContainer();
    showError(c, 'Something went wrong');
    expect(c.querySelector('#error-msg')!.textContent).toBe('Something went wrong');
  });

  it('appends a link element when a link is provided', () => {
    const c = makeErrorContainer();
    showError(c, 'Meeting ended.', { text: 'Return home', href: '#/' });
    const a = c.querySelector<HTMLAnchorElement>('#error-msg a');
    expect(a).not.toBeNull();
    expect(a!.textContent).toBe('Return home');
    expect(a!.getAttribute('href')).toBe('#/');
  });

  it('does not create a link element when none is provided', () => {
    const c = makeErrorContainer();
    showError(c, 'Error');
    expect(c.querySelector('#error-msg a')).toBeNull();
  });

  it('replaces previous content on a second call', () => {
    const c = makeErrorContainer();
    showError(c, 'First error', { text: 'Go', href: '#/' });
    showError(c, 'Second error');
    const el = c.querySelector('#error-msg')!;
    expect(el.textContent).toBe('Second error');
    expect(el.querySelector('a')).toBeNull();
  });
});

// ── tickTimerEl ───────────────────────────────────────────────────────────

describe('tickTimerEl', () => {
  it('updates element text to the remaining time', () => {
    const el = document.createElement('span');
    tickTimerEl(el, Date.now() + 60_000);
    expect(el.textContent).toBe('1:00');
  });

  it('adds urgent class when under 10 seconds remain', () => {
    const el = document.createElement('span');
    tickTimerEl(el, Date.now() + 5_000);
    expect(el.classList.contains('urgent')).toBe(true);
  });

  it('removes urgent class when more than 10 seconds remain', () => {
    const el = document.createElement('span');
    el.classList.add('urgent');
    tickTimerEl(el, Date.now() + 30_000);
    expect(el.classList.contains('urgent')).toBe(false);
  });

  it('returns true when the timer has elapsed', () => {
    const el = document.createElement('span');
    expect(tickTimerEl(el, Date.now() - 1_000)).toBe(true);
  });

  it('returns false when time remains', () => {
    const el = document.createElement('span');
    expect(tickTimerEl(el, Date.now() + 10_000)).toBe(false);
  });
});

// ── setStatus ─────────────────────────────────────────────────────────────

describe('setStatus', () => {
  function makeContainer() {
    const div = document.createElement('div');
    div.innerHTML = `<span id="conn-status"></span>`;
    return div;
  }

  it('sets the status text', () => {
    const c = makeContainer();
    setStatus(c, 'connected', 'Live');
    expect(c.querySelector('#conn-status')!.textContent).toBe('Live');
  });

  it('sets the status class', () => {
    const c = makeContainer();
    setStatus(c, 'connected', 'Live');
    expect(c.querySelector('#conn-status')!.className).toBe('status-chip status-connected');
  });
});

// ── setVoteHighlight ──────────────────────────────────────────────────────

describe('setVoteHighlight', () => {
  function makeContainer() {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="ballot">
        <button data-value="up">Up</button>
        <button data-value="down">Down</button>
      </div>
    `;
    return div;
  }

  it('adds selected class to the matching button', () => {
    const c = makeContainer();
    setVoteHighlight(c, 'up');
    expect(c.querySelector('[data-value="up"]')!.classList.contains('selected')).toBe(true);
  });

  it('removes selected class from non-matching buttons', () => {
    const c = makeContainer();
    setVoteHighlight(c, 'up');
    expect(c.querySelector('[data-value="down"]')!.classList.contains('selected')).toBe(false);
  });

  it('clears all selections when called with null', () => {
    const c = makeContainer();
    setVoteHighlight(c, 'up');
    setVoteHighlight(c, null);
    expect(c.querySelector('[data-value="up"]')!.classList.contains('selected')).toBe(false);
  });
});
