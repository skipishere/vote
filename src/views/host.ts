import type { StateSnapshot, ParticipantMessage, VoteValue } from '../types';
import { getUserName, copyText, generateRoomCode } from '../utils';
import { RoomConnection, type DataConnection } from './roomConnection';
import { setStatus, showError, setVoteHighlight, timerHtml, injectBallots, showActiveBallot, createTimerController, createSettingsController } from './shared';
import { VOTE_TYPES, getVoteType, type VoteTypeDefinition } from '../voteTypes';
import hostHtml from './host.html?raw';

interface ParticipantEntry {
  name: string;
  conn: DataConnection | null;
}

export function renderHost(container: HTMLElement, roomCode: string): () => void {
  const hostName = getUserName();
  if (!hostName) { window.location.hash = '/'; return () => {}; }

  const joinUrl = `${location.origin}${location.pathname}#/join/${roomCode}`;

  const participants = new Map<string, ParticipantEntry>();
  const peerToClient = new Map<string, string>();
  const votes        = new Map<string, VoteValue>();
  let topic          = '';
  let roundId        = String(Date.now());
  let hostVote: VoteValue | null = null;
  let activeVoteType: VoteTypeDefinition = VOTE_TYPES[0];
  let votingActive   = false;
  let resultsHidden  = false;
  let votingLocked   = false;
  let timerEndsAt: number | null = null;
  let setupTimerSeconds: number | null = null;
  let resetSecs = 60;
  let meetingLocked = false;
  const allowedClients = new Set<string>();
  const bannedClients  = new Set<string>();

  participants.set('host', { name: hostName, conn: null });

  container.innerHTML = hostHtml;

  // Populate vote type radio buttons from registry
  const voteTypeOptions = container.querySelector<HTMLElement>('#vote-type-options')!;
  VOTE_TYPES.forEach((vt, i) => {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'vote-type';
    radio.value = vt.id;
    radio.checked = i === 0;
    label.appendChild(radio);
    label.append(` ${vt.label}`);
    voteTypeOptions.appendChild(label);
  });

  injectBallots(container);

  container.querySelector('#timer-slot')!.outerHTML = timerHtml;
  const timer = createTimerController(container, endVote);
  const settings = createSettingsController(container);
  container.querySelector('#settings-btn')!.addEventListener('click', () => settings.open());
  container.querySelector<HTMLElement>('.room-code-badge')!.textContent = roomCode;

  const connection = RoomConnection.host(roomCode, {
    onReady() { setStatus(container, 'connected', 'Live'); },
    onError(err) {
      if (err.type === 'unavailable-id') {
        window.location.hash = `/host/${generateRoomCode()}`;
      } else {
        showError(container, `Connection error: ${err.message}`);
        setStatus(container, 'disconnected', 'Error');
      }
    },
    onConnection(conn) {
      conn.on('data', (raw) => {
        const msg = raw as ParticipantMessage;
        if (msg.type === 'join') {
          const { clientId, name } = msg;
          if (bannedClients.has(clientId)) {
            try { conn.send({ type: 'kicked' }); } catch { /* ignore */ }
            conn.close();
            return;
          }
          if (meetingLocked && !allowedClients.has(clientId)) {
            try { conn.send({ type: 'rejected' }); } catch { /* ignore */ }
            conn.close();
            return;
          }
          allowedClients.add(clientId);
          for (const [pid, cid] of peerToClient) {
            if (cid === clientId && pid !== conn.peer) peerToClient.delete(pid);
          }
          peerToClient.set(conn.peer, clientId);
          participants.set(clientId, { name, conn });
          sendStateTo(conn);
        } else if (msg.type === 'vote') {
          const clientId = peerToClient.get(conn.peer);
          if (clientId && votingActive && !votingLocked) {
            if (msg.value === null) {
              votes.delete(clientId);
            } else if (activeVoteType.values.includes(msg.value)) {
              votes.set(clientId, msg.value);
            }
          }
        }
        broadcast();
        refreshUI();
      });

      conn.on('close', () => {
        const clientId = peerToClient.get(conn.peer);
        peerToClient.delete(conn.peer);
        if (clientId) {
          const entry = participants.get(clientId);
          if (entry?.conn === conn) {
            participants.delete(clientId);
            votes.delete(clientId);
          }
        }
        broadcast();
        refreshUI();
      });
    },
  });

  const topicInput    = container.querySelector<HTMLInputElement>('#topic-input')!;
  const customTimer   = container.querySelector<HTMLInputElement>('#timer-custom')!;

  container.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-preset')!;
      setupTimerSeconds = val === 'none' ? null : parseInt(val, 10);
      container.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('btn-selected'));
      btn.classList.add('btn-selected');
      customTimer.value = '';
    });
  });

  customTimer.addEventListener('input', () => {
    const val = parseInt(customTimer.value, 10);
    if (!isNaN(val) && val >= 5) {
      setupTimerSeconds = val;
      container.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('btn-selected'));
    }
  });

  container.querySelector('#start-btn')!.addEventListener('click', () => {
    topic         = topicInput.value.trim();
    resultsHidden = container.querySelector<HTMLInputElement>('input[name="results-visibility"]:checked')?.value === 'hide';
    activeVoteType = getVoteType(
      container.querySelector<HTMLInputElement>('input[name="vote-type"]:checked')?.value ?? VOTE_TYPES[0].id
    );
    votingActive  = true;
    votingLocked  = false;
    roundId       = String(Date.now());
    votes.clear();
    hostVote = null;

    showActiveBallot(container, activeVoteType.id);
    setVoteHighlight(container, null);
    if (activeVoteType.renderVoters) activeVoteType.renderVoters(container, {}, {}, false);

    const logoEl = container.querySelector<HTMLElement>('#logo-text');
    if (logoEl) logoEl.textContent = activeVoteType.headerLabel;

    container.querySelector<HTMLElement>('#setup-panel')!.hidden = true;
    container.querySelector<HTMLElement>('#active-panel')!.hidden = false;
    container.querySelector<HTMLElement>('#topic-display')!.hidden = false;

    if (setupTimerSeconds !== null) startTimer(setupTimerSeconds);

    broadcast();
    refreshUI();
  });

  container.querySelector('#end-vote-btn')!.addEventListener('click', () => {
    endVote();
  });

  container.querySelector('#new-round-btn')!.addEventListener('click', () => {
    votes.clear();
    hostVote     = null;
    votingActive = false;
    votingLocked = false;
    topic        = '';
    topicInput.value = '';
    stopTimer();
    timerEndsAt = null;

    showActiveBallot(container, VOTE_TYPES[0].id);
    setVoteHighlight(container, null);
    updateLockUI();

    const logoEl = container.querySelector<HTMLElement>('#logo-text');
    if (logoEl) logoEl.textContent = VOTE_TYPES[0].headerLabel;

    container.querySelector<HTMLElement>('#setup-panel')!.hidden = false;
    container.querySelector<HTMLElement>('#active-panel')!.hidden = true;
    container.querySelector<HTMLElement>('#topic-display')!.hidden = true;

    broadcast();
    refreshUI();
  });

  container.querySelector('#reset-timer-btn')!.addEventListener('click', () => {
    const form = container.querySelector<HTMLElement>('#reset-timer-form')!;
    form.hidden = !form.hidden;
  });

  container.querySelectorAll<HTMLButtonElement>('[data-reset-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      resetSecs = parseInt(btn.getAttribute('data-reset-preset')!, 10);
      container.querySelectorAll('[data-reset-preset]').forEach(b => b.classList.remove('btn-selected'));
      btn.classList.add('btn-selected');
      container.querySelector<HTMLInputElement>('#reset-timer-custom')!.value = '';
    });
  });

  container.querySelector<HTMLInputElement>('#reset-timer-custom')!.addEventListener('input', () => {
    const val = parseInt(container.querySelector<HTMLInputElement>('#reset-timer-custom')!.value, 10);
    if (!isNaN(val) && val >= 5) {
      resetSecs = val;
      container.querySelectorAll('[data-reset-preset]').forEach(b => b.classList.remove('btn-selected'));
    }
  });

  container.querySelector('#reset-timer-confirm-btn')!.addEventListener('click', () => {
    votingLocked = false;
    startTimer(resetSecs);
    container.querySelector<HTMLElement>('#reset-timer-form')!.hidden = true;
    updateLockUI();
    broadcast();
    refreshUI();
  });

  function showModal(title: string, body: string, confirmLabel: string, onConfirm: () => void) {
    (container.querySelector('#modal-title') as HTMLElement).textContent = title;
    (container.querySelector('#modal-body')  as HTMLElement).textContent = body;
    const confirmBtn = container.querySelector<HTMLButtonElement>('#modal-confirm-btn')!;
    confirmBtn.textContent = confirmLabel;
    const backdrop = container.querySelector<HTMLElement>('#modal-backdrop')!;
    backdrop.hidden = false;

    const finish = (run: boolean) => {
      backdrop.hidden = true;
      confirmBtn.onclick = null;
      cancelBtn.onclick  = null;
      backdrop.onclick   = null;
      if (run) onConfirm();
    };
    const cancelBtn = container.querySelector<HTMLButtonElement>('#modal-cancel-btn')!;
    confirmBtn.onclick = () => finish(true);
    cancelBtn.onclick  = () => finish(false);
    backdrop.onclick   = (e) => { if (e.target === backdrop) finish(false); };
  }

  container.querySelector('#end-meeting-btn')!.addEventListener('click', () => {
    showModal('End meeting', 'End the meeting? All vote data will be lost.', 'End meeting', () => {
      connection.destroy();
      window.location.hash = '/';
    });
  });

  container.querySelector('#copy-code-btn')!.addEventListener('click', async () => {
    const btn = container.querySelector<HTMLButtonElement>('#copy-code-btn')!;
    await copyText(roomCode);
    btn.textContent = '✓ Copied';
    setTimeout(() => (btn.textContent = 'Copy code'), 2000);
  });

  container.querySelector('#copy-link-btn')!.addEventListener('click', async () => {
    const btn = container.querySelector<HTMLButtonElement>('#copy-link-btn')!;
    await copyText(joinUrl);
    btn.textContent = '✓ Copied';
    setTimeout(() => (btn.textContent = 'Copy link'), 2000);
  });

  container.querySelector('#lock-meeting-btn')!.addEventListener('click', () => {
    meetingLocked = !meetingLocked;
    updateLockMeetingBtn();
  });

  function updateLockMeetingBtn() {
    const btn = container.querySelector<HTMLButtonElement>('#lock-meeting-btn')!;
    btn.textContent = meetingLocked ? '🔓 Unlock' : '🔒 Lock';
    btn.classList.toggle('btn-selected', meetingLocked);
  }

  // Attach ballot click handlers across all vote type ballots
  container.querySelectorAll<HTMLButtonElement>('.ballot button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (votingLocked) return;
      const value = btn.getAttribute('data-value')!;
      if (hostVote === value) {
        hostVote = null;
        votes.delete('host');
      } else {
        hostVote = value;
        votes.set('host', value);
      }
      setVoteHighlight(container, hostVote);
      broadcast();
      refreshUI();
    });
  });

  function startTimer(seconds: number) {
    timerEndsAt = Date.now() + seconds * 1000;
    timer.startAt(timerEndsAt);
  }

  function stopTimer() {
    timerEndsAt = null;
    timer.stop();
  }

  function endVote() {
    votingLocked  = true;
    stopTimer();
    updateLockUI();
    broadcast();
    refreshUI();
  }

  function refreshUI() {
    if (votingActive) {
      // Topic
      const topicDisplay = container.querySelector<HTMLElement>('#topic')!;
      topicDisplay.textContent = topic || 'No topic set';

      // Tallies via active vote type
      const { counts } = snapshot();
      activeVoteType.renderCounts(container, counts, false);

      // Voted summary
      (container.querySelector('#voted-count') as HTMLElement).textContent =
        `${votes.size} of ${participants.size} voted`;
    }

    // Participants list
    const list = container.querySelector('#participant-list')!;
    list.replaceChildren(...Array.from(participants.entries()).map(([id, p]) => {
      const li = document.createElement('li');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name;
      if (id === 'host') {
        const small = document.createElement('small');
        small.textContent = '(you)';
        nameSpan.append(' ', small);
      }

      const badgeSpan = document.createElement('span');
      if (votingActive) {
        const badge = document.createElement('span');
        badge.className = votes.has(id) ? 'voted-badge' : 'waiting-badge';
        badge.textContent = votes.has(id) ? '✓ voted' : 'waiting…';
        badgeSpan.appendChild(badge);
      }

      const kickSpan = document.createElement('span');
      if (id !== 'host') {
        const btn = document.createElement('button');
        btn.dataset.cid = id;
        btn.title = 'Remove from meeting';
        btn.textContent = '✕';
        btn.addEventListener('click', () => {
          const name = participants.get(id)?.name ?? 'this participant';
          showModal('Remove participant', `Remove ${name} from the meeting?`, 'Remove', () => kickParticipant(id));
        });
        kickSpan.appendChild(btn);
      }

      li.append(nameSpan, badgeSpan, kickSpan);
      return li;
    }));
  }

  function kickParticipant(clientId: string) {
    for (const [pid, cid] of peerToClient) {
      if (cid === clientId) { peerToClient.delete(pid); break; }
    }
    const entry = participants.get(clientId);
    if (entry?.conn?.open) {
      try { entry.conn.send({ type: 'kicked' }); } catch { /* ignore */ }
      entry.conn.close();
    }
    participants.delete(clientId);
    votes.delete(clientId);
    allowedClients.delete(clientId);
    bannedClients.add(clientId);
    broadcast();
    refreshUI();
  }

  function updateLockUI() {
    container.querySelector<HTMLElement>('#end-vote-btn')!.hidden = votingLocked;
    container.querySelector<HTMLElement>('#new-round-btn')!.hidden = !votingLocked;
    container.querySelector<HTMLElement>('#reset-timer-btn')!.hidden = !votingLocked;
    if (!votingLocked) container.querySelector<HTMLElement>('#reset-timer-form')!.hidden = true;

    const statusEl = container.querySelector<HTMLElement>('#voting-status')!;
    statusEl.textContent = votingLocked ? '🔒 Vote ended' : '';
    statusEl.className   = `voting-status${votingLocked ? ' locked' : ''}`;

    container.querySelectorAll<HTMLButtonElement>('.ballot button').forEach(btn => {
      btn.disabled = votingLocked;
    });

    const snap = snapshot();
    activeVoteType.applyWinner(container, snap.winner, votingLocked);
    if (activeVoteType.renderVoters) {
      activeVoteType.renderVoters(container, snap.votes, snap.participants, votingLocked);
    }
  }

  function snapshot(): StateSnapshot {
    const ps: Record<string, string> = {};
    participants.forEach((p, id) => (ps[id] = p.name));
    const vs: Record<string, VoteValue> = {};
    votes.forEach((v, id) => (vs[id] = v));
    const { counts, winner } = activeVoteType.computeResult([...votes.values()]);
    return { type: 'state', topic, roundId, voteTypeId: activeVoteType.id, participants: ps, votes: vs, votingActive, resultsHidden, votingLocked, winner, counts, votedCount: votes.size, timerEndsAt };
  }

  function participantSnapshot(clientId: string, snap: StateSnapshot): StateSnapshot {
    if (!snap.resultsHidden || snap.votingLocked) return snap;
    const ownVote = votes.get(clientId);
    const personalVotes: Record<string, VoteValue> = ownVote !== undefined ? { [clientId]: ownVote } : {};
    const emptyCounts = Object.fromEntries(activeVoteType.values.map(v => [v, 0]));
    return { ...snap, votes: personalVotes, counts: emptyCounts, winner: null };
  }

  function sendStateTo(conn: DataConnection) {
    const clientId = peerToClient.get(conn.peer) ?? '';
    const snap = snapshot();
    try { conn.send(participantSnapshot(clientId, snap)); } catch { /* ignore */ }
  }

  function broadcast() {
    const snap = snapshot();
    participants.forEach((p, id) => {
      if (id !== 'host' && p.conn?.open) {
        try { p.conn.send(participantSnapshot(id, snap)); } catch { /* ignore */ }
      }
    });
  }

  refreshUI();

  return () => { stopTimer(); connection.destroy(); };
}
