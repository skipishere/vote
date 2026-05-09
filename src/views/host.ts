import Peer, { type DataConnection } from 'peerjs';
import type { StateSnapshot, ParticipantMessage, VoteValue } from '../types';
import { getUserName, copyText, escHtml, getWinner, formatTime } from '../utils';
import { setStatus, showError } from './shared';
import hostHtml from './host.html?raw';

interface ParticipantEntry {
  name: string;
  conn: DataConnection | null;
}

export function renderHost(container: HTMLElement, roomCode: string): () => void {
  const hostName = getUserName();
  if (!hostName) { window.location.hash = '/'; return () => {}; }

  const peerId  = 'lcv-' + roomCode.toLowerCase();
  const joinUrl = `${location.origin}${location.pathname}#/join/${roomCode}`;

  // ── State ─────────────────────────────────────────────────────────────────
  const participants = new Map<string, ParticipantEntry>();
  const peerToClient = new Map<string, string>();
  const votes        = new Map<string, VoteValue>();
  let topic          = '';
  let roundId        = String(Date.now());
  let hostVote: VoteValue | null = null;
  let votingActive   = false;
  let resultsHidden  = false;
  let votingLocked   = false;
  let timerEndsAt: number | null = null;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let setupTimerSeconds: number | null = null;
  let resetSecs = 60;
  let meetingLocked = false;
  const allowedClients = new Set<string>();
  const bannedClients  = new Set<string>();

  participants.set('host', { name: hostName, conn: null });

  // ── Render ────────────────────────────────────────────────────────────────
  container.innerHTML = hostHtml;
  container.querySelector<HTMLElement>('.room-code-badge')!.textContent = roomCode;

  // ── PeerJS ────────────────────────────────────────────────────────────────
  const peer = new Peer(peerId);

  peer.on('open', () => setStatus(container, 'connected', 'Live'));

  peer.on('error', (err) => {
    if ((err as { type?: string }).type === 'unavailable-id') {
      showError(container, 'This room code is already in use. Please go back and create a new meeting.');
    } else {
      showError(container, `Connection error: ${escHtml(err.message)}`);
    }
    setStatus(container, 'disconnected', 'Error');
  });

  peer.on('connection', (conn) => {
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
          if (msg.value === null) votes.delete(clientId);
          else votes.set(clientId, msg.value);
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
  });

  // ── Setup: timer presets ──────────────────────────────────────────────────
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

  // ── Setup: Start vote ─────────────────────────────────────────────────────
  container.querySelector('#start-btn')!.addEventListener('click', () => {
    topic         = topicInput.value.trim();
    resultsHidden = container.querySelector<HTMLInputElement>('input[name="results-visibility"]:checked')?.value === 'hide';
    votingActive  = true;
    votingLocked  = false;
    roundId       = String(Date.now());

    container.querySelector<HTMLElement>('#setup-panel')!.hidden = true;
    container.querySelector<HTMLElement>('#active-panel')!.hidden = false;
    container.querySelector<HTMLElement>('#topic-display')!.hidden = false;

    if (setupTimerSeconds !== null) startTimer(setupTimerSeconds);

    broadcast();
    refreshUI();
  });

  // ── Active: End vote ──────────────────────────────────────────────────────
  container.querySelector('#end-vote-btn')!.addEventListener('click', () => {
    endVote();
  });

  // ── Active: New round ─────────────────────────────────────────────────────
  container.querySelector('#new-round-btn')!.addEventListener('click', () => {
    votes.clear();
    hostVote     = null;
    votingActive = false;
    votingLocked = false;
    topic        = '';
    topicInput.value = '';
    stopTimer();
    timerEndsAt = null;
    updateVoteButtons(null);
    updateLockUI();

    container.querySelector<HTMLElement>('#setup-panel')!.hidden = false;
    container.querySelector<HTMLElement>('#active-panel')!.hidden = true;
    container.querySelector<HTMLElement>('#topic-display')!.hidden = true;

    broadcast();
    refreshUI();
  });

  // ── Active: Reset timer ───────────────────────────────────────────────────
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

  // ── Modal ─────────────────────────────────────────────────────────────────
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

  // ── End meeting ───────────────────────────────────────────────────────────
  container.querySelector('#end-meeting-btn')!.addEventListener('click', () => {
    showModal('End meeting', 'End the meeting? All vote data will be lost.', 'End meeting', () => {
      peer.destroy();
      window.location.hash = '/';
    });
  });

  // ── Copy buttons ──────────────────────────────────────────────────────────
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

  // ── Lock meeting ──────────────────────────────────────────────────────────
  container.querySelector('#lock-meeting-btn')!.addEventListener('click', () => {
    meetingLocked = !meetingLocked;
    updateLockMeetingBtn();
  });

  function updateLockMeetingBtn() {
    const btn = container.querySelector<HTMLButtonElement>('#lock-meeting-btn')!;
    btn.textContent = meetingLocked ? '🔓 Unlock' : '🔒 Lock';
    btn.classList.toggle('btn-selected', meetingLocked);
  }

  // ── Host vote buttons ─────────────────────────────────────────────────────
  container.querySelectorAll<HTMLButtonElement>('.tally-grid button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (votingLocked) return;
      const value = btn.getAttribute('data-value') as VoteValue;
      if (hostVote === value) {
        hostVote = null;
        votes.delete('host');
      } else {
        hostVote = value;
        votes.set('host', value);
      }
      updateVoteButtons(hostVote);
      broadcast();
      refreshUI();
    });
  });

  // ── Timer ─────────────────────────────────────────────────────────────────
  function startTimer(seconds: number) {
    stopTimer();
    timerEndsAt = Date.now() + seconds * 1000;
    const box = container.querySelector<HTMLElement>('#timer-running-box')!;
    box.hidden = false;

    timerInterval = setInterval(() => {
      const remaining = timerEndsAt! - Date.now();
      const el = container.querySelector<HTMLElement>('#timer-countdown')!;
      el.textContent = formatTime(remaining);
      el.classList.toggle('urgent', remaining <= 10_000 && remaining > 0);

      if (remaining <= 0) {
        stopTimer();
        timerEndsAt = null;
        box.hidden = true;
        endVote();
      }
    }, 500);
  }

  function stopTimer() {
    if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }
  }

  function endVote() {
    votingLocked  = true;
    resultsHidden = false;
    stopTimer();
    timerEndsAt = null;
    container.querySelector<HTMLElement>('#timer-running-box')!.hidden = true;
    updateLockUI();
    broadcast();
    refreshUI();
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  function refreshUI() {
    if (votingActive) {
      // Topic
      const topicDisplay = container.querySelector<HTMLElement>('#topic-display')!;
      topicDisplay.innerHTML = topic
        ? `<span class="topic-text">${escHtml(topic)}</span>`
        : `<span class="topic-placeholder">No topic set</span>`;

      // Tallies
      let up = 0, down = 0, neutral = 0;
      votes.forEach(v => {
        if (v === 'up') up++;
        else if (v === 'down') down++;
        else if (v === 'sideways') neutral++;
      });
      (container.querySelector('#tally-up')      as HTMLElement).textContent = String(up);
      (container.querySelector('#tally-neutral') as HTMLElement).textContent = String(neutral);
      (container.querySelector('#tally-down')    as HTMLElement).textContent = String(down);

      // Voted summary
      (container.querySelector('#voted-summary') as HTMLElement).textContent =
        `${votes.size} of ${participants.size} voted`;
    } else {
      (container.querySelector('#voted-summary') as HTMLElement).textContent =
        `${participants.size} in room`;
    }

    // Participants list
    const list = container.querySelector('#participant-list')!;
    list.innerHTML = Array.from(participants.entries())
      .map(([id, p]) => {
        const tag = id === 'host' ? ` <small>(you)</small>` : '';
        const badge = votingActive
          ? (votes.has(id)
              ? `<span class="voted-badge">✓ voted</span>`
              : `<span class="waiting-badge">waiting…</span>`)
          : '';
        const kickBtn = id !== 'host'
          ? `<button data-cid="${escHtml(id)}" title="Remove from meeting">✕</button>`
          : '';
        return `<li><span>${escHtml(p.name)}${tag}</span><span>${badge}</span><span>${kickBtn}</span></li>`;
      })
      .join('');

    list.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid  = btn.getAttribute('data-cid')!;
        const name = participants.get(cid)?.name ?? 'this participant';
        showModal('Remove participant', `Remove ${escHtml(name)} from the meeting?`, 'Remove', () => kickParticipant(cid));
      });
    });
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

  function updateVoteButtons(selected: VoteValue | null) {
    container.querySelectorAll('.tally-grid button').forEach(btn =>
      btn.classList.toggle('selected', btn.getAttribute('data-value') === selected)
    );
    container.querySelector('#tally-grid')?.classList.toggle('has-selection', selected !== null);
  }

  function updateLockUI() {
    container.querySelector<HTMLElement>('#end-vote-btn')!.hidden = votingLocked;
    container.querySelector<HTMLElement>('#new-round-btn')!.hidden = !votingLocked;
    container.querySelector<HTMLElement>('#reset-timer-btn')!.hidden = !votingLocked;
    if (!votingLocked) container.querySelector<HTMLElement>('#reset-timer-form')!.hidden = true;

    const statusEl = container.querySelector<HTMLElement>('#voting-status')!;
    statusEl.textContent = votingLocked ? '🔒 Vote ended' : '';
    statusEl.className   = `voting-status${votingLocked ? ' locked' : ''}`;

    container.querySelectorAll<HTMLButtonElement>('.tally-grid button').forEach(btn => {
      btn.disabled = votingLocked;
    });

    // Winner highlight
    const ids = ['tally-card-up', 'tally-card-neutral', 'tally-card-down'];
    ids.forEach(id => container.querySelector(`#${id}`)?.classList.remove('winner'));
    container.querySelector('#tally-grid')?.classList.toggle('has-winner', votingLocked);
    if (votingLocked) {
      let up = 0, neutral = 0, down = 0;
      votes.forEach(v => { if (v === 'up') up++; else if (v === 'down') down++; else neutral++; });
      const winner = getWinner(up, neutral, down);
      const cardId = winner === 'up' ? 'tally-card-up' : 'tally-card-down';
      container.querySelector(`#${cardId}`)?.classList.add('winner');
    }
  }

  function snapshot(): StateSnapshot {
    const ps: Record<string, string> = {};
    participants.forEach((p, id) => (ps[id] = p.name));
    const vs: Record<string, VoteValue> = {};
    votes.forEach((v, id) => (vs[id] = v));
    return { type: 'state', topic, roundId, participants: ps, votes: vs, votingActive, resultsHidden, votingLocked, timerEndsAt };
  }

  function sendStateTo(conn: DataConnection) {
    try { conn.send(snapshot()); } catch { /* ignore */ }
  }

  function broadcast() {
    const snap = snapshot();
    participants.forEach((p, id) => {
      if (id !== 'host' && p.conn?.open) {
        try { p.conn.send(snap); } catch { /* ignore */ }
      }
    });
  }

  refreshUI();

  return () => { stopTimer(); peer.destroy(); };
}
