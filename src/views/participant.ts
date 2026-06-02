import type { StateSnapshot, VoteValue } from '../types';
import { getClientId, getUserName, setUserName } from '../utils';
import { setStatus, showError, setVoteHighlight, timerHtml, injectBallots, showActiveBallot, hideError, createTimerController, createSettingsController } from './shared';
import { getVoteType } from '../voteTypes';
import { RoomConnection } from './roomConnection';
import participantHtml from './participant.html?raw';

export function renderParticipant(container: HTMLElement, roomCode: string): () => void {
  container.innerHTML = participantHtml;

  injectBallots(container);

  container.querySelector('#timer-slot')!.outerHTML = timerHtml;
  container.querySelector<HTMLElement>('#room-code-display')!.textContent = roomCode;

  const timer = createTimerController(container);
  const settings = createSettingsController(container);
  container.querySelector('#settings-btn')!.addEventListener('click', () => settings.open());

  const myClientId = getClientId();
  let currentVote: VoteValue | null = null;
  let currentRoundId = '';
  let displayedTimerEndsAt: number | null = null;
  let connection: RoomConnection | null = null;

  function startSession(userName: string) {
    hideError(container);
    container.querySelector<HTMLElement>('#gate-view')!.hidden = true;
    container.querySelector<HTMLElement>('#participant-view')!.hidden = false;

    connection = RoomConnection.participant(roomCode, {
      onConnected() {
        connection!.send({ type: 'join', name: userName, clientId: myClientId });
        setStatus(container, 'connected', 'Live');
        enableButtons(true);
      },
      onData(raw) {
        const msg = raw as { type: string };
        if (msg.type === 'kicked') {
          showError(container, 'You have been removed from this meeting.', { text: 'Return home', href: '#/' });
          setStatus(container, 'disconnected', 'Removed');
          enableButtons(false);
          return;
        }
        if (msg.type === 'rejected') {
          showError(container, 'This meeting is locked — no new participants can join.', { text: 'Return home', href: '#/' });
          setStatus(container, 'disconnected', 'Locked out');
          enableButtons(false);
          return;
        }
        const snap = raw as StateSnapshot;
        if (snap.type !== 'state') return;

        if (snap.roundId !== currentRoundId) {
          currentRoundId = snap.roundId;
          currentVote = null;
          setVoteHighlight(container, null);
        }

        applySnapshot(snap);
      },
      onDisconnected() {
        setStatus(container, 'disconnected', 'Disconnected');
        enableButtons(false);
        showError(container, 'The host has ended the meeting.', { text: 'Return home', href: '#/' });
        timer.stop();
      },
      onError(err) {
        const msg = err.type === 'peer-unavailable'
          ? 'Meeting not found. Check the room code or wait for the host to connect.'
          : `Connection error: ${err.message}`;
        const link = err.type === 'peer-unavailable' ? { text: 'Try again', href: '#/' } : undefined;
        showError(container, msg, link);
        setStatus(container, 'disconnected', 'Error');
        enableButtons(false);
      },
    });
  }

  const storedName = getUserName();
  if (storedName) {
    startSession(storedName);
  } else {
    const nameInput = container.querySelector<HTMLInputElement>('#name-input')!;
    nameInput.focus();
    const submit = () => {
      const name = nameInput.value.trim();
      if (!name) { showError(container, 'Please enter your name.'); return; }
      setUserName(name);
      startSession(name);
    };
    container.querySelector('#join-btn')!.addEventListener('click', submit);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  container.querySelector('#leave-btn')!.addEventListener('click', () => {
    connection?.destroy();
    window.location.hash = '/';
  });

  container.querySelectorAll<HTMLButtonElement>('.ballot button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!connection?.isOpen) return;
      const value = btn.getAttribute('data-value')!;
      if (currentVote === value) {
        currentVote = null;
        connection.send({ type: 'vote', value: null });
      } else {
        currentVote = value;
        connection.send({ type: 'vote', value });
      }
      setVoteHighlight(container, currentVote);
    });
  });

  function applySnapshot(snap: StateSnapshot) {
    container.querySelector<HTMLElement>('#waiting-view')!.hidden = snap.votingActive;
    container.querySelector<HTMLElement>('#voting-view')!.hidden = !snap.votingActive;

    if (!snap.votingActive) return;

    showActiveBallot(container, snap.voteTypeId);

    const voteType = getVoteType(snap.voteTypeId);

    const topic = container.querySelector('#topic')!;
    topic.textContent = snap.topic || 'No topic set';

    const total = Object.keys(snap.participants).length;
    (container.querySelector('#voted-count') as HTMLElement).textContent = `${snap.votedCount} of ${total} voted`;

    const logoEl = container.querySelector<HTMLElement>('#logo-text');
    if (logoEl) logoEl.textContent = voteType.headerLabel;

    const hidden = snap.resultsHidden && !snap.votingLocked;
    voteType.renderCounts(container, snap.counts, hidden);
    voteType.applyWinner(container, snap.winner, snap.votingLocked && !hidden);
    if (voteType.renderVoters) {
      voteType.renderVoters(container, snap.votes, snap.participants, snap.votingLocked);
    }

    const lockStatus = container.querySelector<HTMLElement>('#lock-banner')!;
    lockStatus.textContent = snap.votingLocked ? '🔒 Vote ended' : '';
    lockStatus.classList.toggle('locked', snap.votingLocked);
    enableButtons(!snap.votingLocked);

    const serverVote = (snap.votes[myClientId] as VoteValue | undefined) ?? null;
    if (serverVote !== currentVote) {
      currentVote = serverVote;
      setVoteHighlight(container, currentVote);
    }

    updateTimer(snap.timerEndsAt);
  }

  function updateTimer(endsAt: number | null) {
    if (endsAt === displayedTimerEndsAt) return;
    displayedTimerEndsAt = endsAt;
    if (!endsAt) { timer.stop(); return; }
    timer.startAt(endsAt);
  }

  function enableButtons(enabled: boolean) {
    container.querySelectorAll<HTMLButtonElement>('.ballot button').forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  return () => {
    timer.stop();
    connection?.destroy();
  };
}
