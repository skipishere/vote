export function setStatus(container: HTMLElement, cls: string, label: string): void {
  const el = container.querySelector('#conn-status')!;
  el.className = `status-chip status-${cls}`;
  el.innerHTML = `<span class="dot"></span>${label}`;
}

export function showError(container: HTMLElement, msg: string): void {
  const el = container.querySelector<HTMLElement>('#error-msg')!;
  el.innerHTML = msg;
  el.classList.remove('hidden');
}
