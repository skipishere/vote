import Peer, { type DataConnection } from 'peerjs';
import type { StateSnapshot, VoteValue } from '../types';
import { getClientId, getUserName, setUserName, escHtml } from '../utils';
import { setStatus, showError, setVoteHighlight, tickTimerEl, timerHtml, injectBallots, showActiveBallot, hideError } from './shared';
import { getVoteType } from '../voteTypes';
import participantHtml from './participant.html?raw';

export function renderParticipant(container: HTMLElement, roomCode: string): () => void {
  container.innerHTML = participantHtml;

  injectBallots(container);

  container.querySelector('#timer-slot')!.outerHTML = timerHtml;
  container.querySelector<HTMLElement>('#room-code-display')!.textContent = roomCode;

  const myClientId = getClientId();
  let currentVote: VoteValue | null = null;
  let currentRoundId = '';
  let conn: DataConnection | null = null;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let displayedTimerEndsAt: number | null = null;
  let peer: Peer | null = null;

  function startSession(userName: string) {
    hideError(container);
    container.querySelector<HTMLElement>('#gate-view')!.hidden = true;
    container.querySelector<HTMLElement>('#participant-view')!.hidden = false;

    const hostPeerId = 'lcv-' + roomCode.toLowerCase();
    peer = new Peer();

    peer.on('open', () => {
      conn = peer!.connect(hostPeerId, { reliable: true });

      conn.on('open', () => {
        conn!.send({ type: 'join', name: userName, clientId: myClientId });
        setStatus(container, 'connected', 'Live');
        enableButtons(true);
      });

      conn.on('data', (raw) => {
        const msg = raw as { type: string };
        if (msg.type === 'kicked') {
          showError(container, 'You have been removed from this meeting. <a href="#/">Return home</a>');
          setStatus(container, 'disconnected', 'Removed');
          enableButtons(false);
          return;
        }
        if (msg.type === 'rejected') {
          showError(container, 'This meeting is locked — no new participants can join. <a href="#/">Return home</a>');
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
      });

      conn.on('close', () => {
        setStatus(container, 'disconnected', 'Disconnected');
        enableButtons(false);
        showError(container, 'The host has ended the meeting. <a href="#/">Return home</a>');
        if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }
      });

      conn.on('error', () => {
        setStatus(container, 'disconnected', 'Error');
        enableButtons(false);
      });
    });

    peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      const msg = type === 'peer-unavailable'
        ? `Meeting not found. Check the room code or wait for the host to connect. <a href="#/">Try again</a>`
        : `Connection error: ${err.message}`;
      showError(container, msg);
      setStatus(container, 'disconnected', 'Error');
      enableButtons(false);
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
    peer?.destroy();
    window.location.hash = '/';
  });

  container.querySelectorAll<HTMLButtonElement>('.ballot button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!conn?.open) return;
      const value = btn.getAttribute('data-value')!;
      if (currentVote === value) {
        currentVote = null;
        conn.send({ type: 'vote', value: null });
      } else {
        currentVote = value;
        conn.send({ type: 'vote', value });
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
    topic.textContent = snap.topic ? escHtml(snap.topic) : 'No topic set';

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
    if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }

    const box = container.querySelector<HTMLElement>('#timer-running-box')!;
    if (!endsAt) { box.hidden = true; return; }

    const display = container.querySelector<HTMLElement>('#timer-running-box span:last-child')!;
    box.hidden = false;
    tickTimerEl(display, endsAt);
    timerInterval = setInterval(() => {
      if (tickTimerEl(display, endsAt)) { clearInterval(timerInterval!); timerInterval = null; }
    }, 500);
  }

  function enableButtons(enabled: boolean) {
    container.querySelectorAll<HTMLButtonElement>('.ballot button').forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  return () => {
    if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }
    peer?.destroy();
  };
}
