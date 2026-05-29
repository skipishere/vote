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
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function formatTime(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
