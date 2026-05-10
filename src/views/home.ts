import { generateRoomCode, getUserName, setUserName } from '../utils';
import homeHtml from './home.html?raw';

export function renderHome(container: HTMLElement): () => void {
  container.innerHTML = homeHtml;

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
    errorMsg.hidden = false;
  }

  function clearError() {
    errorMsg.hidden = true;
  }

  function getName(): string | null {
    const n = nameInput.value.trim();
    if (!n) {
      showError('Please enter your name.');
      nameInput.focus();
      return null;
    }
    return n;
  }

  function switchTab(tab: 'create' | 'join') {
    container.querySelectorAll('.tabs button').forEach(b =>
      b.classList.toggle('active', b.getAttribute('data-tab') === tab)
    );
    container.querySelectorAll('.tab-panel').forEach(p =>
      p.classList.toggle('active', p.id === `panel-${tab}`)
    );
  }

  container.querySelectorAll('.tabs button').forEach(btn => {
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
    if (!code) { 
      showError('Please enter the room code.');
      codeInput.focus();
      return; 
    }
    setUserName(name);
    window.location.hash = `/join/${code}`;
  });

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase();
    clearError();
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') container.querySelector<HTMLButtonElement>('.tabs button.active')?.click();
  });

  return () => {};
}
