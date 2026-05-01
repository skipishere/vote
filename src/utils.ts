/** Stable per-browser identity, persists across reconnects. */
export function getClientId(): string {
  let id = localStorage.getItem('lcv_clientId');
  if (!id) {
    id = `c_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('lcv_clientId', id);
  }
  return id;
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function getUserName(): string {
  return localStorage.getItem('lcv_name') || '';
}

export function setUserName(name: string): void {
  localStorage.setItem('lcv_name', name.trim());
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
  }
}

export function escHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// neutral/no-votes never win; compare only up vs down, down wins ties
export function getWinner(up: number, _neutral: number, down: number): 'up' | 'down' {
  return down >= up ? 'down' : 'up';
}
