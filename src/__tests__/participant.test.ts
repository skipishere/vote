import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParticipantHandlers } from '../views/roomConnection';
import { RoomConnection } from '../views/roomConnection';
import { renderParticipant } from '../views/participant';
import type { StateSnapshot } from '../types';

vi.mock('../views/roomConnection', () => ({
  RoomConnection: { participant: vi.fn() },
}));

function makeSnapshot(overrides: Partial<StateSnapshot> = {}): StateSnapshot {
  return {
    type: 'state',
    topic: 'Test topic',
    roundId: 'r1',
    voteTypeId: 'lean-coffee',
    participants: { host: 'Host' },
    votes: {},
    votingActive: true,
    resultsHidden: false,
    votingLocked: false,
    winner: null,
    counts: { up: 0, neutral: 0, down: 0 },
    votedCount: 0,
    timerEndsAt: null,
    ...overrides,
  };
}

describe('renderParticipant', () => {
  let container: HTMLElement;
  let handlers: ParticipantHandlers;

  beforeEach(() => {
    localStorage.setItem('lcv_name', 'Alice');
    container = document.createElement('div');
    document.body.appendChild(container);

    vi.mocked(RoomConnection.participant).mockImplementation((_code, h) => {
      handlers = h as ParticipantHandlers;
      return { destroy: vi.fn(), send: vi.fn(), isOpen: false } as any;
    });

    renderParticipant(container, 'TEST01');
  });

  afterEach(() => {
    document.body.removeChild(container);
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('skips the gate view when a name is already stored', () => {
      expect(container.querySelector<HTMLElement>('#gate-view')!.hidden).toBe(true);
      expect(container.querySelector<HTMLElement>('#participant-view')!.hidden).toBe(false);
    });

    it('displays the room code', () => {
      expect(container.querySelector('#room-code-display')!.textContent).toBe('TEST01');
    });

    it('shows the waiting view before any snapshot arrives', () => {
      expect(container.querySelector<HTMLElement>('#waiting-view')!.hidden).toBe(false);
      expect(container.querySelector<HTMLElement>('#voting-view')!.hidden).toBe(true);
    });
  });

  // ── Error messages with links (test plan items 5 & 6) ──────────────────

  describe('error messages', () => {
    it('shows a "Return home" link when the participant is kicked', () => {
      handlers.onData({ type: 'kicked' });
      const el = container.querySelector<HTMLElement>('#error-msg')!;
      expect(el.hidden).toBe(false);
      expect(el.textContent).toContain('removed from this meeting');
      expect(el.querySelector<HTMLAnchorElement>('a')!.textContent).toBe('Return home');
    });

    it('shows a "Return home" link when the meeting is locked', () => {
      handlers.onData({ type: 'rejected' });
      const el = container.querySelector<HTMLElement>('#error-msg')!;
      expect(el.hidden).toBe(false);
      expect(el.textContent).toContain('locked');
      expect(el.querySelector<HTMLAnchorElement>('a')!.textContent).toBe('Return home');
    });

    it('shows a "Return home" link when the host disconnects', () => {
      handlers.onDisconnected();
      const el = container.querySelector<HTMLElement>('#error-msg')!;
      expect(el.textContent).toContain('ended the meeting');
      expect(el.querySelector<HTMLAnchorElement>('a')!.textContent).toBe('Return home');
    });

    it('shows a "Try again" link for peer-unavailable errors', () => {
      handlers.onError({ type: 'peer-unavailable', message: 'not found' });
      const el = container.querySelector<HTMLElement>('#error-msg')!;
      expect(el.textContent).toContain('Meeting not found');
      expect(el.querySelector<HTMLAnchorElement>('a')!.textContent).toBe('Try again');
    });

    it('shows a plain message with no link for other connection errors', () => {
      handlers.onError({ type: 'network-error', message: 'timed out' });
      const el = container.querySelector<HTMLElement>('#error-msg')!;
      expect(el.textContent).toContain('Connection error');
      expect(el.textContent).toContain('timed out');
      expect(el.querySelector('a')).toBeNull();
    });
  });

  // ── Snapshot application (test plan item 4) ───────────────────────────

  describe('snapshot application', () => {
    it('shows the voting view when votingActive is true', () => {
      handlers.onData(makeSnapshot({ votingActive: true }));
      expect(container.querySelector<HTMLElement>('#voting-view')!.hidden).toBe(false);
      expect(container.querySelector<HTMLElement>('#waiting-view')!.hidden).toBe(true);
    });

    it('shows the waiting view when votingActive is false', () => {
      handlers.onData(makeSnapshot({ votingActive: false }));
      expect(container.querySelector<HTMLElement>('#waiting-view')!.hidden).toBe(false);
    });

    it('displays the topic text', () => {
      handlers.onData(makeSnapshot({ topic: 'My topic' }));
      expect(container.querySelector('#topic')!.textContent).toBe('My topic');
    });

    it('shows "No topic set" when the topic is empty', () => {
      handlers.onData(makeSnapshot({ topic: '' }));
      expect(container.querySelector('#topic')!.textContent).toBe('No topic set');
    });

    it('shows voted count', () => {
      handlers.onData(makeSnapshot({ votedCount: 2, participants: { host: 'Host', p1: 'Alice', p2: 'Bob' } }));
      expect(container.querySelector('#voted-count')!.textContent).toContain('2 of 3');
    });

    it('resets the vote highlight when a new round starts', () => {
      handlers.onData(makeSnapshot({ roundId: 'r1', votes: { alice: 'up' } }));
      handlers.onData(makeSnapshot({ roundId: 'r2', votes: {} }));
      const selected = container.querySelector('.ballot button.selected');
      expect(selected).toBeNull();
    });
  });

  // ── Timer sync (test plan item 4) ─────────────────────────────────────

  describe('timer display', () => {
    it('shows the timer box when timerEndsAt is provided', () => {
      handlers.onData(makeSnapshot({ timerEndsAt: Date.now() + 60_000 }));
      expect(container.querySelector<HTMLElement>('#timer-running-box')!.hidden).toBe(false);
    });

    it('hides the timer box when timerEndsAt is null', () => {
      handlers.onData(makeSnapshot({ timerEndsAt: Date.now() + 60_000 }));
      handlers.onData(makeSnapshot({ timerEndsAt: null }));
      expect(container.querySelector<HTMLElement>('#timer-running-box')!.hidden).toBe(true);
    });

    it('does not re-render the timer when timerEndsAt is unchanged', () => {
      const endsAt = Date.now() + 60_000;
      handlers.onData(makeSnapshot({ timerEndsAt: endsAt }));
      const display = container.querySelector<HTMLElement>('#timer-running-box span:last-child')!;
      const textAfterFirst = display.textContent;
      handlers.onData(makeSnapshot({ timerEndsAt: endsAt }));
      expect(display.textContent).toBe(textAfterFirst);
    });
  });
});
