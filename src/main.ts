import './style.css';
import { renderHome } from './views/home';
import { renderHost } from './views/host';
import { renderParticipant } from './views/participant';

let cleanup: (() => void) | null = null;

function getRoute(): { view: string; param: string } {
  const hash = window.location.hash.slice(1); // strip leading #
  const parts = hash.split('/').filter(Boolean);
  return { view: parts[0] ?? '', param: parts[1] ?? '' };
}

function render() {
  cleanup?.();
  cleanup = null;

  const app = document.getElementById('app')!;
  const { view, param } = getRoute();

  if (view === 'host' && param) {
    cleanup = renderHost(app, param);
  } else if (view === 'join' && param) {
    cleanup = renderParticipant(app, param);
  } else {
    cleanup = renderHome(app);
  }
}

window.addEventListener('hashchange', render);
render();
