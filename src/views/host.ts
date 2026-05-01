import Peer, { type DataConnection } from 'peerjs';
import type { StateSnapshot, ParticipantMessage, VoteValue } from '../types';
import { getUserName, copyText, escHtml } from '../utils';

interface ParticipantEntry {
  name: string;
  conn: DataConnection;
}

export function renderHost(container: HTMLElement, roomCode: string): () => void {
  const hostName = getUserName();
  if (!hostName) { window.location.hash = '/'; return () => {}; }

  const peerId = 'lcv-' + roomCode.toLowerCase();
  const joinUrl = `${location.origin}${location.pathname}#/join/${roomCode}`;

  // All state lives here in memory — gone when host closes the tab
  const participants = new Map<string, ParticipantEntry>(); // 'host' + participant peerIds
  const votes = new Map<string, VoteValue>();
  let topic = '';
  let roundId = String(Date.now());
  let hostVote: VoteValue | null = null;

  participants.set('host', { name: hostName, conn: null as unknown as DataConnection });

  container.innerHTML = `
    <div class="page">
      <div class="w-full">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
          <div class="logo">☕ Lean Coffee Vote</div>
          <span id="conn-status" class="status-chip status-connecting"><span class="dot"></span>Starting…</span>
        </div>

        <div class="room-bar mt-sm" style="margin-bottom:1rem">
          <div>
            <div class="section-label">Room code</div>
            <div class="room-code">${escHtml(roomCode)}</div>
          </div>
          <div class="room-actions">
            <button id="copy-code-btn" class="btn btn-ghost btn-sm">Copy code</button>
            <button id="copy-link-btn" class="btn btn-ghost btn-sm">Copy join link</button>
          </div>
        </div>

        <div id="error-msg" class="error-msg" style="display:none;margin-bottom:1rem"></div>

        <div class="tally-grid" style="margin-bottom:1rem">
          <div class="tally-card up">
            <div class="tally-icon">👍</div>
            <div class="tally-count" id="tally-up">0</div>
            <div class="tally-label">Continue</div>
          </div>
          <div class="tally-card neutral">
            <div class="tally-icon">👉</div>
            <div class="tally-count" id="tally-neutral">0</div>
            <div class="tally-label">Either way</div>
          </div>
          <div class="tally-card down">
            <div class="tally-icon">👎</div>
            <div class="tally-count" id="tally-down">0</div>
            <div class="tally-label">Move on</div>
          </div>
        </div>

        <div class="panel" style="margin-bottom:1rem">
          <div class="section-label">Your vote</div>
          <div class="vote-buttons" style="justify-content:flex-start;margin-bottom:1rem">
            <button class="vote-btn" data-value="up"><span class="vote-icon">👍</span><span class="vote-label">Continue</span></button>
            <button class="vote-btn" data-value="sideways"><span class="vote-icon">👉</span><span class="vote-label">Either way</span></button>
            <button class="vote-btn" data-value="down"><span class="vote-icon">👎</span><span class="vote-label">Move on</span></button>
          </div>

          <hr class="divider" />

          <div class="section-label">Topic</div>
          <div class="topic-row">
            <input id="topic-input" type="text" placeholder="Current discussion topic (optional)" maxlength="120" />
            <button id="set-topic-btn" class="btn btn-ghost btn-sm">Set</button>
          </div>

          <div class="controls-row">
            <button id="reset-btn" class="btn btn-ghost">↺ Reset votes</button>
            <button id="end-btn" class="btn btn-danger btn-sm">End meeting</button>
          </div>
        </div>

        <div class="panel">
          <div class="section-label">Participants</div>
          <div id="voted-summary" class="voted-summary">0 of 1 voted</div>
          <ul id="participant-list" class="participant-list"></ul>
        </div>
      </div>
    </div>
  `;

  // ── PeerJS setup ──────────────────────────────────────────────────────────

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
        participants.set(conn.peer, { name: msg.name, conn });
      } else if (msg.type === 'vote') {
        if (msg.value === null) votes.delete(conn.peer);
        else votes.set(conn.peer, msg.value);
      }
      broadcast();
      refreshUI();
    });

    conn.on('close', () => {
      participants.delete(conn.peer);
      votes.delete(conn.peer);
      broadcast();
      refreshUI();
    });
  });

  // ── Event listeners ───────────────────────────────────────────────────────

  const topicInput = container.querySelector<HTMLInputElement>('#topic-input')!;

  function commitTopic() {
    topic = topicInput.value.trim();
    broadcast();
  }

  container.querySelector('#set-topic-btn')!.addEventListener('click', commitTopic);
  topicInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitTopic(); });

  container.querySelector('#reset-btn')!.addEventListener('click', () => {
    votes.clear();
    hostVote = null;
    roundId = String(Date.now());
    topic = '';
    topicInput.value = '';
    updateVoteButtons(null);
    broadcast();
    refreshUI();
  });

  container.querySelector('#end-btn')!.addEventListener('click', () => {
    if (confirm('End the meeting? All vote data will be lost.')) {
      broadcast(); // final state update so participants see disconnection
      peer.destroy();
      window.location.hash = '/';
    }
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
    setTimeout(() => (btn.textContent = 'Copy join link'), 2000);
  });

  container.querySelectorAll<HTMLButtonElement>('.vote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
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

  // ── State helpers ─────────────────────────────────────────────────────────

  function snapshot(): StateSnapshot {
    const ps: Record<string, string> = {};
    participants.forEach((p, id) => (ps[id] = p.name));
    const vs: Record<string, VoteValue> = {};
    votes.forEach((v, id) => (vs[id] = v));
    return { type: 'state', topic, roundId, participants: ps, votes: vs };
  }

  function sendStateTo(conn: DataConnection) {
    try { conn.send(snapshot()); } catch { /* ignore closed conn */ }
  }

  function broadcast() {
    const snap = snapshot();
    participants.forEach((p, id) => {
      if (id !== 'host' && p.conn?.open) {
        try { p.conn.send(snap); } catch { /* ignore */ }
      }
    });
  }

  // ── UI updates ────────────────────────────────────────────────────────────

  function refreshUI() {
    let up = 0, down = 0, neutral = 0;
    votes.forEach((v) => {
      if (v === 'up') up++;
      else if (v === 'down') down++;
      else if (v === 'sideways') neutral++;
    });
    (container.querySelector('#tally-up')    as HTMLElement).textContent = String(up);
    (container.querySelector('#tally-neutral')as HTMLElement).textContent = String(neutral);
    (container.querySelector('#tally-down')  as HTMLElement).textContent = String(down);

    const total = participants.size;
    const voted = votes.size;
    (container.querySelector('#voted-summary') as HTMLElement).textContent =
      `${voted} of ${total} voted`;

    const list = container.querySelector('#participant-list')!;
    list.innerHTML = Array.from(participants.entries())
      .map(([id, p]) => {
        const badge = votes.has(id)
          ? `<span class="voted-badge">✓ voted</span>`
          : `<span class="waiting-badge">waiting…</span>`;
        const tag = id === 'host' ? ' <small style="color:var(--text-muted)">(you)</small>' : '';
        return `<li class="participant-item"><span>${escHtml(p.name)}${tag}</span>${badge}</li>`;
      })
      .join('');
  }

  function updateVoteButtons(selected: VoteValue | null) {
    container.querySelectorAll('.vote-btn').forEach((btn) =>
      btn.classList.toggle('selected', btn.getAttribute('data-value') === selected)
    );
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

  return () => { peer.destroy(); };
}
