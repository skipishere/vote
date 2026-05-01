import Peer, { type DataConnection } from 'peerjs';
import type { StateSnapshot, ParticipantMessage, VoteValue } from '../types';
import { getUserName, copyText, escHtml, getWinner } from '../utils';

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

  participants.set('host', { name: hostName, conn: null });

  // ── Render ────────────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="page">
      <div style="width:100%;max-width:860px">

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.625rem;margin-bottom:1rem">
          <div class="logo">☕ Lean Coffee Vote</div>
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
            <span style="font-size:1.25rem;font-weight:700;letter-spacing:0.15em;font-family:ui-monospace,'Cascadia Code',monospace">${escHtml(roomCode)}</span>
            <button id="copy-code-btn" class="btn btn-ghost btn-sm">Copy code</button>
            <button id="copy-link-btn" class="btn btn-ghost btn-sm">Copy link</button>
            <span id="conn-status" class="status-chip status-connecting"><span class="dot"></span>Starting…</span>
            <button class="btn btn-danger btn-sm end-meeting-btn">End meeting</button>
          </div>
        </div>

        <div id="error-msg" class="error-msg" style="display:none;margin-bottom:1rem"></div>

        <div class="host-grid">

          <!-- Left: phase-dependent content -->
          <div>

            <!-- SETUP PANEL -->
            <div id="setup-panel" class="panel">
              <div class="section-label">Topic</div>
              <input id="topic-input" type="text" placeholder="What are we discussing? (optional)" maxlength="120" style="margin-bottom:1rem" />

              <hr class="divider" />

              <div class="section-label">Timer</div>
              <div class="timer-options" style="margin-bottom:1rem">
                <button class="btn btn-ghost btn-sm btn-selected" data-preset="none">No timer</button>
                <button class="btn btn-ghost btn-sm" data-preset="60">1m</button>
                <button class="btn btn-ghost btn-sm" data-preset="120">2m</button>
                <button class="btn btn-ghost btn-sm" data-preset="300">5m</button>
                <input id="timer-custom" type="number" min="5" max="600" placeholder="Custom" />
                <span class="timer-unit">sec</span>
              </div>

              <hr class="divider" />

              <div class="section-label">Results</div>
              <div class="radio-group" style="margin-bottom:1rem">
                <label class="radio-label">
                  <input type="radio" name="results-visibility" value="show" checked />
                  Show to participants
                </label>
                <label class="radio-label">
                  <input type="radio" name="results-visibility" value="hide" />
                  Hide until vote ends
                </label>
              </div>

              <hr class="divider" />

              <div class="controls-row">
                <button id="start-btn" class="btn btn-primary">▶ Start vote</button>
              </div>
            </div>

            <!-- ACTIVE PANEL -->
            <div id="active-panel" style="display:none">

              <div id="topic-display" class="topic-box" style="margin-bottom:0.75rem">
                <span class="topic-placeholder">No topic set</span>
              </div>

              <div class="tally-grid" id="tally-grid" style="margin-bottom:0.375rem">
                <div class="tally-card up" id="tally-card-up">
                  <div class="tally-icon">👍</div>
                  <div class="tally-count" id="tally-up">0</div>
                  <div class="tally-label">Continue</div>
                </div>
                <div class="tally-card neutral" id="tally-card-neutral">
                  <div class="tally-icon">👉</div>
                  <div class="tally-count" id="tally-neutral">0</div>
                  <div class="tally-label">Either way</div>
                </div>
                <div class="tally-card down" id="tally-card-down">
                  <div class="tally-icon">👎</div>
                  <div class="tally-count" id="tally-down">0</div>
                  <div class="tally-label">Move on</div>
                </div>
              </div>
              <div id="voting-status" class="voting-status" style="margin-bottom:0.5rem"></div>

              <div id="timer-running-box" class="timer-box" style="display:none;margin-bottom:0.75rem">
                <span class="timer-box-label">Time remaining</span>
                <span id="timer-countdown" class="timer-countdown">1:00</span>
              </div>

              <div class="panel" style="margin-bottom:0.75rem">
                <div class="section-label">Your vote</div>
                <div class="vote-buttons" style="justify-content:flex-start">
                  <button class="vote-btn host-vote-btn" data-value="up"><span class="vote-icon">👍</span><span class="vote-label">Continue</span></button>
                  <button class="vote-btn host-vote-btn" data-value="sideways"><span class="vote-icon">👉</span><span class="vote-label">Either way</span></button>
                  <button class="vote-btn host-vote-btn" data-value="down"><span class="vote-icon">👎</span><span class="vote-label">Move on</span></button>
                </div>
              </div>

              <div class="controls-row">
                <button id="end-vote-btn" class="btn btn-ghost">End vote</button>
                <button id="new-round-btn" class="btn btn-ghost" style="display:none">↺ New round</button>
                <button id="reset-timer-btn" class="btn btn-ghost" style="display:none">⏱ Reset timer</button>
              </div>

              <div id="reset-timer-form" style="display:none;margin-top:0.625rem">
                <div class="section-label" style="margin-bottom:0.5rem">Set timer duration</div>
                <div class="timer-options">
                  <button class="btn btn-ghost btn-sm btn-selected" data-reset-preset="60">1m</button>
                  <button class="btn btn-ghost btn-sm" data-reset-preset="120">2m</button>
                  <button class="btn btn-ghost btn-sm" data-reset-preset="300">5m</button>
                  <input id="reset-timer-custom" type="number" min="5" max="600" placeholder="Custom" />
                  <span class="timer-unit">sec</span>
                  <button id="reset-timer-confirm-btn" class="btn btn-primary btn-sm">▶ Go</button>
                </div>
              </div>

            </div>
          </div>

          <!-- Right: participants (always visible) -->
          <div class="panel">
            <div class="section-label">Participants</div>
            <div id="voted-summary" class="voted-summary"></div>
            <ul id="participant-list" class="participant-list"></ul>
          </div>

        </div>
      </div>
    </div>
  `;

  // ── PeerJS ────────────────────────────────────────────────────────────────
  const peer = new Peer(peerId);

  peer.on('open', () => setStatus('connected', 'Live'));

  peer.on('error', (err) => {
    if ((err as { type?: string }).type === 'unavailable-id') {
      showError('This room code is already in use. Please go back and create a new meeting.');
    } else {
      showError(`Connection error: ${err.message}`);
    }
    setStatus('disconnected', 'Error');
  });

  peer.on('connection', (conn) => {
    conn.on('open', () => sendStateTo(conn));

    conn.on('data', (raw) => {
      const msg = raw as ParticipantMessage;
      if (msg.type === 'join') {
        const { clientId, name } = msg;
        for (const [pid, cid] of peerToClient) {
          if (cid === clientId && pid !== conn.peer) peerToClient.delete(pid);
        }
        peerToClient.set(conn.peer, clientId);
        participants.set(clientId, { name, conn });
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

    container.querySelector<HTMLElement>('#setup-panel')!.style.display  = 'none';
    container.querySelector<HTMLElement>('#active-panel')!.style.display = '';

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

    container.querySelector<HTMLElement>('#setup-panel')!.style.display  = '';
    container.querySelector<HTMLElement>('#active-panel')!.style.display = 'none';

    broadcast();
    refreshUI();
  });

  // ── Active: Reset timer ───────────────────────────────────────────────────
  container.querySelector('#reset-timer-btn')!.addEventListener('click', () => {
    const form = container.querySelector<HTMLElement>('#reset-timer-form')!;
    form.style.display = form.style.display === 'none' ? '' : 'none';
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
    container.querySelector<HTMLElement>('#reset-timer-form')!.style.display = 'none';
    updateLockUI();
    broadcast();
    refreshUI();
  });

  // ── End meeting (both panels) ─────────────────────────────────────────────
  container.querySelectorAll('.end-meeting-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm('End the meeting? All vote data will be lost.')) {
        peer.destroy();
        window.location.hash = '/';
      }
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

  // ── Host vote buttons ─────────────────────────────────────────────────────
  container.querySelectorAll<HTMLButtonElement>('.host-vote-btn').forEach((btn) => {
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
    box.style.display = '';

    timerInterval = setInterval(() => {
      const remaining = timerEndsAt! - Date.now();
      const el = container.querySelector<HTMLElement>('#timer-countdown')!;
      el.textContent = formatTime(remaining);
      el.classList.toggle('urgent', remaining <= 10_000 && remaining > 0);

      if (remaining <= 0) {
        stopTimer();
        timerEndsAt = null;
        box.style.display = 'none';
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
    container.querySelector<HTMLElement>('#timer-running-box')!.style.display = 'none';
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
        const tag = id === 'host' ? ` <small style="color:var(--text-muted)">(you)</small>` : '';
        const badge = votingActive
          ? (votes.has(id)
              ? `<span class="voted-badge">✓ voted</span>`
              : `<span class="waiting-badge">waiting…</span>`)
          : '';
        return `<li class="participant-item"><span>${escHtml(p.name)}${tag}</span>${badge}</li>`;
      })
      .join('');
  }

  function updateVoteButtons(selected: VoteValue | null) {
    container.querySelectorAll('.host-vote-btn').forEach(btn =>
      btn.classList.toggle('selected', btn.getAttribute('data-value') === selected)
    );
    container.querySelector('.host-vote-btn')?.closest('.vote-buttons')
      ?.classList.toggle('has-selection', selected !== null);
  }

  function updateLockUI() {
    (container.querySelector<HTMLElement>('#end-vote-btn')!).style.display   = votingLocked ? 'none' : '';
    (container.querySelector<HTMLElement>('#new-round-btn')!).style.display  = votingLocked ? '' : 'none';
    (container.querySelector<HTMLElement>('#reset-timer-btn')!).style.display = votingLocked ? '' : 'none';
    if (!votingLocked) (container.querySelector<HTMLElement>('#reset-timer-form')!).style.display = 'none';

    const statusEl = container.querySelector<HTMLElement>('#voting-status')!;
    statusEl.textContent = votingLocked ? '🔒 Vote ended' : '';
    statusEl.className   = `voting-status${votingLocked ? ' locked' : ''}`;

    container.querySelectorAll<HTMLButtonElement>('.host-vote-btn').forEach(btn => {
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

  function setStatus(cls: string, label: string) {
    const el = container.querySelector('#conn-status')!;
    el.className = `status-chip status-${cls}`;
    el.innerHTML = `<span class="dot"></span>${label}`;
  }

  function showError(msg: string) {
    const el = container.querySelector<HTMLElement>('#error-msg')!;
    el.textContent = msg;
    el.style.display = '';
  }

  refreshUI();

  return () => { stopTimer(); peer.destroy(); };
}

function formatTime(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
