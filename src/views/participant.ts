import Peer, { type DataConnection } from 'peerjs';
import type { StateSnapshot, VoteValue } from '../types';
import { getUserName, setUserName, escHtml } from '../utils';

export function renderParticipant(container: HTMLElement, roomCode: string): () => void {
  // If no name stored, show name entry before connecting
  const storedName = getUserName();
  if (!storedName) {
    return renderNameGate(container, roomCode);
  }
  return renderVoteUI(container, roomCode, storedName);
}

// ── Name gate (shown when navigating directly from a shared link) ────────────

function renderNameGate(container: HTMLElement, roomCode: string): () => void {
  container.innerHTML = `
    <div class="page" style="justify-content:center;gap:1.5rem">
      <div class="logo">☕ Lean Coffee Vote</div>
      <div class="card">
        <h2>Join meeting <span style="font-family:monospace;letter-spacing:0.1em">${escHtml(roomCode)}</span></h2>
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

  let cleanup: (() => void) = () => {};

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
  let myPeerId = '';
  let currentVote: VoteValue | null = null;
  let currentRoundId = '';
  let conn: DataConnection | null = null;

  container.innerHTML = `
    <div class="page" style="justify-content:center;gap:1.25rem">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;max-width:440px">
        <div class="logo">☕ Lean Coffee Vote</div>
        <span id="conn-status" class="status-chip status-connecting"><span class="dot"></span>Connecting…</span>
      </div>

      <div id="error-msg" class="error-msg" style="display:none;width:100%;max-width:440px"></div>

      <div class="topic-box" id="topic-box">
        <span class="topic-placeholder">Waiting for host…</span>
      </div>

      <div class="vote-buttons" id="vote-buttons">
        <button class="vote-btn" data-value="up" disabled><span class="vote-icon">👍</span><span class="vote-label">Continue</span></button>
        <button class="vote-btn" data-value="sideways" disabled><span class="vote-icon">👉</span><span class="vote-label">Either way</span></button>
        <button class="vote-btn" data-value="down" disabled><span class="vote-icon">👎</span><span class="vote-label">Move on</span></button>
      </div>

      <div class="vote-summary">
        <div class="section-label" id="voted-count" style="margin-bottom:0.75rem">0 of 0 voted</div>
        <div class="summary-row">
          <div class="mini-tally up"><span class="mini-icon">👍</span><span class="mini-count" id="sum-up">0</span></div>
          <div class="mini-tally neutral"><span class="mini-icon">👉</span><span class="mini-count" id="sum-neutral">0</span></div>
          <div class="mini-tally down"><span class="mini-icon">👎</span><span class="mini-count" id="sum-down">0</span></div>
        </div>
      </div>

      <a href="#/" style="font-size:0.875rem;color:var(--text-muted)">← Leave meeting</a>
    </div>
  `;

  // ── PeerJS ────────────────────────────────────────────────────────────────

  const peer = new Peer();

  peer.on('open', (id) => {
    myPeerId = id;
    conn = peer.connect(hostPeerId, { reliable: true });

    conn.on('open', () => {
      conn!.send({ type: 'join', name: userName });
      setStatus('connected', 'Live');
      enableButtons(true);
    });

    conn.on('data', (raw) => {
      const snap = raw as StateSnapshot;
      if (snap.type !== 'state') return;

      if (snap.roundId !== currentRoundId) {
        // New round — clear local vote state
        currentRoundId = snap.roundId;
        currentVote = null;
      }

      applySnapshot(snap);
    });

    conn.on('close', () => {
      setStatus('disconnected', 'Disconnected');
      enableButtons(false);
      showError('The host has ended the meeting. <a href="#/">Return home</a>');
    });

    conn.on('error', () => {
      setStatus('disconnected', 'Error');
      enableButtons(false);
    });
  });

  peer.on('error', (err) => {
    const type = (err as { type?: string }).type;
    if (type === 'peer-unavailable') {
      showError('Meeting not found. Check the room code or ask the host to confirm they\'re connected. <a href="#/">Try again</a>');
    } else {
      showError(`Connection error: ${err.message}`);
    }
    setStatus('disconnected', 'Error');
    enableButtons(false);
  });

  // ── Vote buttons ──────────────────────────────────────────────────────────

  container.querySelectorAll<HTMLButtonElement>('.vote-btn').forEach((btn) => {
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

  // ── UI helpers ────────────────────────────────────────────────────────────

  function applySnapshot(snap: StateSnapshot) {
    // Topic
    const topicBox = container.querySelector('#topic-box')!;
    topicBox.innerHTML = snap.topic
      ? `<span class="topic-text">${escHtml(snap.topic)}</span>`
      : `<span class="topic-placeholder">No topic set</span>`;

    // Tallies
    const vs = Object.values(snap.votes);
    (container.querySelector('#sum-up')     as HTMLElement).textContent = String(vs.filter(v => v === 'up').length);
    (container.querySelector('#sum-neutral')as HTMLElement).textContent = String(vs.filter(v => v === 'sideways').length);
    (container.querySelector('#sum-down')   as HTMLElement).textContent = String(vs.filter(v => v === 'down').length);

    const total = Object.keys(snap.participants).length;
    (container.querySelector('#voted-count') as HTMLElement).textContent =
      `${vs.length} of ${total} voted`;

    // Reconcile our own vote from server state (handles round resets from host)
    const serverVote = (snap.votes[myPeerId] as VoteValue | undefined) ?? null;
    if (serverVote !== currentVote) {
      currentVote = serverVote;
      highlightVote(currentVote);
    }
  }

  function highlightVote(selected: VoteValue | null) {
    container.querySelectorAll('.vote-btn').forEach((btn) =>
      btn.classList.toggle('selected', btn.getAttribute('data-value') === selected)
    );
  }

  function enableButtons(enabled: boolean) {
    container.querySelectorAll<HTMLButtonElement>('.vote-btn').forEach((btn) => {
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

  return () => { peer.destroy(); };
}
