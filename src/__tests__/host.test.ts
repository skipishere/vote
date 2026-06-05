import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DataConnection, HostHandlers } from '../views/roomConnection';
import { RoomConnection } from '../views/roomConnection';
import { renderHost } from '../views/host';

vi.mock('../views/roomConnection', () => ({
  RoomConnection: { host: vi.fn() },
}));

function makePeerConn(peerId = 'peer-1') {
  const listeners: Record<string, (data?: unknown) => void> = {};
  const conn = {
    peer: peerId,
    open: true,
    on: vi.fn((event: string, cb: (data?: unknown) => void) => { listeners[event] = cb; }),
    send: vi.fn(),
    close: vi.fn(),
    emit: (event: string, data?: unknown) => listeners[event]?.(data),
  };
  return conn as unknown as DataConnection & { emit: (event: string, data?: unknown) => void };
}

describe('renderHost', () => {
  let container: HTMLElement;
  let handlers: HostHandlers;

  beforeEach(() => {
    localStorage.setItem('lcv_name', 'Host User');
    container = document.createElement('div');
    document.body.appendChild(container);

    vi.mocked(RoomConnection.host).mockImplementation((_code, h) => {
      handlers = h as HostHandlers;
      return { destroy: vi.fn() } as any;
    });

    renderHost(container, 'ROOM01');
  });

  afterEach(() => {
    document.body.removeChild(container);
    localStorage.clear();
    vi.clearAllMocks();
  });

  // ── Participant list (test plan item 1) ──────────────────────────────

  describe('participant list', () => {
    it('shows the host in the list on load', () => {
      const items = container.querySelectorAll('#participant-list li');
      expect(items).toHaveLength(1);
      expect(items[0].textContent).toContain('Host User');
      expect(items[0].textContent).toContain('(you)');
    });

    it('does not show a kick button for the host', () => {
      expect(container.querySelectorAll('#participant-list button')).toHaveLength(0);
    });

    it('adds a participant to the list when they join', () => {
      const conn = makePeerConn();
      handlers.onConnection(conn);
      conn.emit('data', { type: 'join', clientId: 'c1', name: 'Alice' });

      const names = Array.from(container.querySelectorAll('#participant-list li')).map(li => li.textContent);
      expect(names.some(t => t?.includes('Alice'))).toBe(true);
    });

    it('shows a kick button for joined participants', () => {
      const conn = makePeerConn();
      handlers.onConnection(conn);
      conn.emit('data', { type: 'join', clientId: 'c1', name: 'Alice' });

      expect(container.querySelectorAll('#participant-list button')).toHaveLength(1);
    });

    it('removes a participant when they disconnect', () => {
      const conn = makePeerConn();
      handlers.onConnection(conn);
      conn.emit('data', { type: 'join', clientId: 'c1', name: 'Alice' });
      conn.emit('close');

      expect(container.querySelectorAll('#participant-list li')).toHaveLength(1);
    });

    it('shows waiting badge for participant who has not voted during a vote', () => {
      const conn = makePeerConn();
      handlers.onConnection(conn);
      conn.emit('data', { type: 'join', clientId: 'c1', name: 'Alice' });
      container.querySelector<HTMLButtonElement>('#start-btn')!.click();

      const badge = container.querySelector('#participant-list .waiting-badge');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('waiting…');
    });

    it('shows voted badge after participant casts a vote', () => {
      const conn = makePeerConn();
      handlers.onConnection(conn);
      conn.emit('data', { type: 'join', clientId: 'c1', name: 'Alice' });
      container.querySelector<HTMLButtonElement>('#start-btn')!.click();
      conn.emit('data', { type: 'vote', value: 'up' });

      const badge = container.querySelector('#participant-list .voted-badge');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('✓ voted');
    });
  });

  // ── Kick participant (test plan item 2) ───────────────────────────────

  describe('kick participant', () => {
    let conn: ReturnType<typeof makePeerConn>;

    beforeEach(() => {
      conn = makePeerConn();
      handlers.onConnection(conn);
      conn.emit('data', { type: 'join', clientId: 'c1', name: 'Alice' });
    });

    it('opens a confirmation modal when the kick button is clicked', () => {
      container.querySelector<HTMLButtonElement>('#participant-list button')!.click();
      expect(container.querySelector<HTMLDialogElement>('#modal-dialog')!.open).toBe(true);
      expect(container.querySelector('#modal-title')!.textContent).toBe('Remove participant');
      expect(container.querySelector('#modal-body')!.textContent).toContain('Alice');
    });

    it('removes the participant from the list after confirming', () => {
      container.querySelector<HTMLButtonElement>('#participant-list button')!.click();
      container.querySelector<HTMLButtonElement>('#modal-confirm-btn')!.click();
      expect(container.querySelectorAll('#participant-list li')).toHaveLength(1);
    });

    it('sends a kicked message to the participant', () => {
      container.querySelector<HTMLButtonElement>('#participant-list button')!.click();
      container.querySelector<HTMLButtonElement>('#modal-confirm-btn')!.click();
      expect(conn.send).toHaveBeenCalledWith({ type: 'kicked' });
    });

    it('cancels the kick when the modal is dismissed', () => {
      container.querySelector<HTMLButtonElement>('#participant-list button')!.click();
      container.querySelector<HTMLButtonElement>('#modal-cancel-btn')!.click();
      expect(container.querySelectorAll('#participant-list li')).toHaveLength(2);
    });
  });

  // ── Vote lifecycle (test plan item 3) ─────────────────────────────────

  describe('vote lifecycle', () => {
    it('shows the active panel and hides setup when vote starts', () => {
      container.querySelector<HTMLButtonElement>('#start-btn')!.click();
      expect(container.querySelector<HTMLElement>('#active-panel')!.hidden).toBe(false);
      expect(container.querySelector<HTMLElement>('#setup-panel')!.hidden).toBe(true);
    });

    it('displays the topic during the vote', () => {
      container.querySelector<HTMLInputElement>('#topic-input')!.value = 'Sprint planning';
      container.querySelector<HTMLButtonElement>('#start-btn')!.click();
      expect(container.querySelector('#topic')!.textContent).toBe('Sprint planning');
    });

    it('shows "No topic set" when the topic field is empty', () => {
      container.querySelector<HTMLButtonElement>('#start-btn')!.click();
      expect(container.querySelector('#topic')!.textContent).toBe('No topic set');
    });

    it('shows the new-round button and hides end-vote when vote ends', () => {
      container.querySelector<HTMLButtonElement>('#start-btn')!.click();
      container.querySelector<HTMLButtonElement>('#end-vote-btn')!.click();
      expect(container.querySelector<HTMLElement>('#new-round-btn')!.hidden).toBe(false);
      expect(container.querySelector<HTMLElement>('#end-vote-btn')!.hidden).toBe(true);
    });

    it('returns to setup panel after new round', () => {
      container.querySelector<HTMLButtonElement>('#start-btn')!.click();
      container.querySelector<HTMLButtonElement>('#end-vote-btn')!.click();
      container.querySelector<HTMLButtonElement>('#new-round-btn')!.click();
      expect(container.querySelector<HTMLElement>('#setup-panel')!.hidden).toBe(false);
      expect(container.querySelector<HTMLElement>('#active-panel')!.hidden).toBe(true);
    });
  });

  // ── Timer (test plan item 3) ──────────────────────────────────────────

  describe('timer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('shows the timer box when a preset is selected and vote starts', () => {
      container.querySelector<HTMLButtonElement>('[data-preset="60"]')!.click();
      container.querySelector<HTMLButtonElement>('#start-btn')!.click();
      expect(container.querySelector<HTMLElement>('#timer-running-box')!.hidden).toBe(false);
    });

    it('ends the vote automatically when the timer expires', () => {
      container.querySelector<HTMLButtonElement>('[data-preset="60"]')!.click();
      container.querySelector<HTMLButtonElement>('#start-btn')!.click();
      vi.advanceTimersByTime(61_000);
      expect(container.querySelector<HTMLElement>('#new-round-btn')!.hidden).toBe(false);
    });

    it('hides the timer box after the vote ends', () => {
      container.querySelector<HTMLButtonElement>('[data-preset="60"]')!.click();
      container.querySelector<HTMLButtonElement>('#start-btn')!.click();
      vi.advanceTimersByTime(61_000);
      expect(container.querySelector<HTMLElement>('#timer-running-box')!.hidden).toBe(true);
    });

    it('does not start a timer when "No timer" is selected', () => {
      container.querySelector<HTMLButtonElement>('[data-preset="none"]')!.click();
      container.querySelector<HTMLButtonElement>('#start-btn')!.click();
      expect(container.querySelector<HTMLElement>('#timer-running-box')!.hidden).toBe(true);
    });
  });
});
