import Peer, { type DataConnection } from 'peerjs';
import type { StateSnapshot, VoteValue } from '../types';
import { getClientId, getUserName, setUserName, escHtml, getWinner } from '../utils';

export function renderParticipant(container: HTMLElement, roomCode: string): () => void {
  const storedName = getUserName();
  if (!storedName) return renderNameGate(container, roomCode);
  return renderVoteUI(container, roomCode, storedName);
}

// ── Name gate (shown when arriving via a shared link with no stored name) ────

function renderNameGate(container: HTMLElement, roomCode: string): () => void {
  container.innerHTML = `
    <div class="page" style="justify-content:center;gap:1.5rem">
      <div class="logo">☕ Lean Coffee Vote</div>
      <div class="card">
        <h2>Join <span style="font-family:monospace;letter-spacing:0.1em">${escHtml(roomCode)}</span></h2>
        <div class="form-group">
          <label for="name-input">Your name</label>
          <input id="name-input" type="text" placeholder="e.g. Alex" maxlength="40" autocomplete="nickname" />
        </div>
        <button id="join-btn" class="btn btn-primary btn-full">Join</button>
        <div id="error-msg" class="error-msg mt-sm" style="display:none"></div>
      </div>
    </div>
  `;

  const nameInput = container.querySelector<HTMLInputElement>('#name-input')!;
  nameInput.focus();
  let cleanup: () => void = () => {};

  function submit() {
    const name = nameInput.value.trim();
    if (!name) {
      const el = container.querySelector<HTMLElement>('#error-msg')!;
      el.textContent = 'Please enter your name.';
      el.style.display = '';
      return;
    }
    setUserName(name);
    cleanup = renderVoteUI(container, roomCode, name);
  }

  container.querySelector('#join-btn')!.addEventListener('click', submit);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  return () => cleanup();
}

// ── Main voting UI ────────────────────────────────────────────────────────────

function renderVoteUI(container: HTMLElement, roomCode: string, userName: string): () => void {
  const hostPeerId = 'lcv-' + roomCode.toLowerCase();
  const myClientId = getClientId(); // stable across reconnects

  let currentVote: VoteValue | null = null;
  let currentRoundId = '';
  let conn: DataConnection | null = null;
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let displayedTimerEndsAt: number | null = null;

  container.innerHTML = `
    <div class="page" style="justify-content:center;gap:1.25rem">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;max-width:860px">
        <div class="logo">☕ Lean Coffee Vote</div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <span id="conn-status" class="status-chip status-connecting"><span class="dot"></span>Connecting…</span>
          <button id="leave-btn" class="btn btn-danger btn-sm">Leave</button>
        </div>
      </div>

      <div id="error-msg" class="error-msg" style="display:none;width:100%;max-width:860px"></div>

      <!-- Shown before host starts the vote -->
      <div id="waiting-view" class="topic-box" style="width:100%;max-width:860px">
        <span class="topic-placeholder">⏳ Waiting for host to start the vote…</span>
      </div>

      <!-- Shown once votingActive = true; display:contents makes children direct flex items -->
      <div id="voting-view" style="display:none;width:100%;max-width:860px">

      <div class="topic-box" id="topic-box"></div>

      <div style="width:100%">
        <div class="section-label" id="voted-count" style="text-align:center;margin-bottom:0.625rem">0 of 0 voted</div>
        <div class="tally-grid" id="p-tally-grid">
          <button class="tally-card up p-vote-btn" id="p-tally-card-up" data-value="up" disabled>
            <div class="tally-icon">👍</div>
            <div class="tally-count" id="p-tally-up">—</div>
            <div class="tally-label">Continue</div>
          </button>
          <button class="tally-card neutral p-vote-btn" id="p-tally-card-neutral" data-value="sideways" disabled>
            <div class="tally-icon">👉</div>
            <div class="tally-count" id="p-tally-neutral">—</div>
            <div class="tally-label">Either way</div>
          </button>
          <button class="tally-card down p-vote-btn" id="p-tally-card-down" data-value="down" disabled>
            <div class="tally-icon">👎</div>
            <div class="tally-count" id="p-tally-down">—</div>
            <div class="tally-label">Move on</div>
          </button>
        </div>
      </div>

      <div id="timer-box" class="timer-compact" style="display:none">
        <span class="timer-compact-label">⏱ Time remaining</span>
        <span id="timer-display" class="timer-countdown">0:00</span>
      </div>

      <div id="lock-banner" class="voting-status" style="margin-bottom:0"></div>

      </div> <!-- /voting-view -->
    </div>
  `;

  container.querySelector('#leave-btn')!.addEventListener('click', () => {
    peer.destroy();
    window.location.hash = '/';
  });

  // ── PeerJS ────────────────────────────────────────────────────────────────
  const peer = new Peer();

  peer.on('open', () => {
    conn = peer.connect(hostPeerId, { reliable: true });

    conn.on('open', () => {
      conn!.send({ type: 'join', name: userName, clientId: myClientId });
      setStatus('connected', 'Live');
      enableButtons(true);
    });

    conn.on('data', (raw) => {
      const msg = raw as { type: string };
      if (msg.type === 'kicked') {
        showError('You have been removed from this meeting. <a href="#/">Return home</a>');
        setStatus('disconnected', 'Removed');
        enableButtons(false);
        return;
      }
      if (msg.type === 'rejected') {
        showError('This meeting is locked — no new participants can join. <a href="#/">Return home</a>');
        setStatus('disconnected', 'Locked out');
        enableButtons(false);
        return;
      }
      const snap = raw as StateSnapshot;
      if (snap.type !== 'state') return;

      if (snap.roundId !== currentRoundId) {
        currentRoundId = snap.roundId;
        currentVote = null;
        highlightVote(null); // clear immediately — don't wait for reconciliation below
      }

      applySnapshot(snap);
    });

    conn.on('close', () => {
      setStatus('disconnected', 'Disconnected');
      enableButtons(false);
      showError('The host has ended the meeting. <a href="#/">Return home</a>');
      clearTimer();
    });

    conn.on('error', () => {
      setStatus('disconnected', 'Error');
      enableButtons(false);
    });
  });

  peer.on('error', (err) => {
    const type = (err as { type?: string }).type;
    const msg = type === 'peer-unavailable'
      ? `Meeting not found. Check the room code or wait for the host to connect. <a href="#/">Try again</a>`
      : `Connection error: ${err.message}`;
    showError(msg);
    setStatus('disconnected', 'Error');
    enableButtons(false);
  });

  // ── Vote buttons ──────────────────────────────────────────────────────────
  container.querySelectorAll<HTMLButtonElement>('.p-vote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!conn?.open) return;
      const value = btn.getAttribute('data-value') as VoteValue;
      if (currentVote === value) {
        currentVote = null;
        conn.send({ type: 'vote', value: null });
      } else {
        currentVote = value;
        conn.send({ type: 'vote', value });
      }
      highlightVote(currentVote);
    });
  });

  // ── Snapshot application ──────────────────────────────────────────────────
  function applySnapshot(snap: StateSnapshot) {
    // Toggle waiting / voting views
    (container.querySelector<HTMLElement>('#waiting-view')!).style.display = snap.votingActive ? 'none' : '';
    const votingView = container.querySelector<HTMLElement>('#voting-view')!;
    votingView.style.display = snap.votingActive ? 'flex' : 'none';
    votingView.style.flexDirection = 'column';
    votingView.style.gap = '1.25rem';

    if (!snap.votingActive) return; // nothing else to update while waiting

    // Topic
    const topicBox = container.querySelector('#topic-box')!;
    topicBox.innerHTML = snap.topic
      ? `<span class="topic-text">${escHtml(snap.topic)}</span>`
      : `<span class="topic-placeholder">No topic set</span>`;

    // Voted count
    const total = Object.keys(snap.participants).length;
    const votedN = Object.keys(snap.votes).length;
    (container.querySelector('#voted-count') as HTMLElement).textContent = `${votedN} of ${total} voted`;

    // Tally counts + winner highlight
    const vs = Object.values(snap.votes);
    const upCount      = vs.filter(v => v === 'up').length;
    const neutralCount = vs.filter(v => v === 'sideways').length;
    const downCount    = vs.filter(v => v === 'down').length;
    const hidden = snap.resultsHidden;

    (container.querySelector('#p-tally-up')      as HTMLElement).textContent = hidden ? '?' : String(upCount);
    (container.querySelector('#p-tally-neutral') as HTMLElement).textContent = hidden ? '?' : String(neutralCount);
    (container.querySelector('#p-tally-down')    as HTMLElement).textContent = hidden ? '?' : String(downCount);
    ['p-tally-up', 'p-tally-neutral', 'p-tally-down'].forEach(id =>
      container.querySelector(`#${id}`)?.classList.toggle('hidden-count', hidden)
    );

    const pGrid = container.querySelector('#p-tally-grid')!;
    ['p-tally-card-up', 'p-tally-card-neutral', 'p-tally-card-down'].forEach(id =>
      container.querySelector(`#${id}`)?.classList.remove('winner')
    );
    const showWinner = snap.votingLocked && !hidden;
    pGrid.classList.toggle('has-winner', showWinner);
    if (showWinner) {
      const winner = getWinner(upCount, neutralCount, downCount);
      container.querySelector(`#${winner === 'up' ? 'p-tally-card-up' : 'p-tally-card-down'}`)?.classList.add('winner');
    }

    // Locked state
    const lockStatus = container.querySelector<HTMLElement>('#lock-banner')!;
    lockStatus.textContent = snap.votingLocked ? '🔒 Vote ended' : '';
    lockStatus.classList.toggle('locked', snap.votingLocked);
    enableButtons(!snap.votingLocked); // votingActive is guaranteed true here

    // Reconcile own vote (handles round resets from host)
    const serverVote = (snap.votes[myClientId] as VoteValue | undefined) ?? null;
    if (serverVote !== currentVote) {
      currentVote = serverVote;
      highlightVote(currentVote);
    }

    // Timer
    updateTimer(snap.timerEndsAt);
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  function updateTimer(endsAt: number | null) {
    if (endsAt === displayedTimerEndsAt) return;
    displayedTimerEndsAt = endsAt;
    clearTimer();

    const timerBox = container.querySelector<HTMLElement>('#timer-box')!;
    if (!endsAt) { timerBox.style.display = 'none'; return; }

    timerBox.style.display = '';
    tick(endsAt);
    timerInterval = setInterval(() => tick(endsAt), 500);
  }

  function tick(endsAt: number) {
    const remaining = endsAt - Date.now();
    const display = container.querySelector<HTMLElement>('#timer-display')!;
    display.textContent = formatTime(remaining);
    display.classList.toggle('urgent', remaining <= 10_000 && remaining > 0);
    if (remaining <= 0) clearTimer();
  }

  function clearTimer() {
    if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }
  }

  // ── Misc helpers ──────────────────────────────────────────────────────────
  function highlightVote(selected: VoteValue | null) {
    container.querySelectorAll('.p-vote-btn').forEach((btn) =>
      btn.classList.toggle('selected', btn.getAttribute('data-value') === selected)
    );
    container.querySelector('#p-tally-grid')?.classList.toggle('has-selection', selected !== null);
  }

  function enableButtons(enabled: boolean) {
    container.querySelectorAll<HTMLButtonElement>('.p-vote-btn').forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  function setStatus(cls: string, label: string) {
    const el = container.querySelector('#conn-status')!;
    el.className = `status-chip status-${cls}`;
    el.innerHTML = `<span class="dot"></span>${label}`;
  }

  function showError(msg: string) {
    const el = container.querySelector<HTMLElement>('#error-msg')!;
    el.innerHTML = msg;
    el.style.display = '';
  }

  return () => {
    clearTimer();
    peer.destroy();
  };
}

function formatTime(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
