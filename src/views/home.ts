import { generateRoomCode, getUserName, setUserName } from '../utils';

export function renderHome(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="page" style="justify-content:center;gap:1.5rem">
      <div class="logo">☕ Lean Coffee Vote</div>
      <div class="card">
        <div class="form-group">
          <label for="name-input">Your name</label>
          <input id="name-input" type="text" placeholder="e.g. Alex" maxlength="40" autocomplete="nickname" />
        </div>

        <div class="tabs">
          <button class="tab-btn active" data-tab="create">Host a meeting</button>
          <button class="tab-btn" data-tab="join">Join a meeting</button>
        </div>

        <div id="panel-create" class="tab-panel active">
          <button id="create-btn" class="btn btn-primary btn-full">Create meeting</button>
        </div>

        <div id="panel-join" class="tab-panel">
          <div class="form-group">
            <label for="code-input">Room code</label>
            <input id="code-input" type="text" placeholder="e.g. ABC123" maxlength="6"
              autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" />
          </div>
          <button id="join-btn" class="btn btn-primary btn-full">Join meeting</button>
        </div>

        <div id="error-msg" class="error-msg mt-sm" style="display:none"></div>
      </div>
    </div>
  `;

  const nameInput = container.querySelector<HTMLInputElement>('#name-input')!;
  const codeInput = container.querySelector<HTMLInputElement>('#code-input')!;
  const errorMsg  = container.querySelector<HTMLElement>('#error-msg')!;

  nameInput.value = getUserName();
  nameInput.focus();

  // If we arrived here after typing a join code (e.g. back-nav), pre-fill the URL fragment param
  const hash = window.location.hash.slice(1);
  const fromCode = hash.startsWith('/from/') ? hash.slice(6) : '';
  if (fromCode) {
    switchTab('join');
    codeInput.value = fromCode;
  }

  function showError(msg: string) {
    errorMsg.textContent = msg;
    errorMsg.style.display = '';
  }

  function clearError() {
    errorMsg.style.display = 'none';
  }

  function getName(): string | null {
    const n = nameInput.value.trim();
    if (!n) { showError('Please enter your name.'); nameInput.focus(); return null; }
    return n;
  }

  function switchTab(tab: 'create' | 'join') {
    container.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.getAttribute('data-tab') === tab)
    );
    container.querySelectorAll('.tab-panel').forEach(p =>
      p.classList.toggle('active', p.id === `panel-${tab}`)
    );
  }

  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      clearError();
      switchTab(btn.getAttribute('data-tab') as 'create' | 'join');
    });
  });

  container.querySelector('#create-btn')!.addEventListener('click', () => {
    const name = getName();
    if (!name) return;
    setUserName(name);
    const code = generateRoomCode();
    window.location.hash = `/host/${code}`;
  });

  container.querySelector('#join-btn')!.addEventListener('click', () => {
    const name = getName();
    if (!name) return;
    const code = codeInput.value.trim().toUpperCase();
    if (!code) { showError('Please enter the room code.'); codeInput.focus(); return; }
    setUserName(name);
    window.location.hash = `/join/${code}`;
  });

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase();
    clearError();
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') container.querySelector<HTMLButtonElement>('.tab-btn.active')?.click();
  });

  return () => {};
}
