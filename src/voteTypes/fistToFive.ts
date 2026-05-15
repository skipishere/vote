import type { VoteTypeDefinition, VoteResult } from './definition';
import ballotHtml from '../views/ballot-fist-to-five.html?raw';

const VALUES = ['0', '1', '2', '3', '4', '5'] as const;

export const fistToFiveType: VoteTypeDefinition = {
  id: 'fist-to-five',
  label: 'Fist to Five (0–5)',
  headerLabel: '✊ Fist to Five',
  ballotHtml,
  values: VALUES,

  computeResult(votes: string[]): VoteResult {
    const counts: Record<string, number> = Object.fromEntries(VALUES.map(v => [v, 0]));
    for (const v of votes) {
      if (v in counts) counts[v]++;
    }
    return { counts, winner: null };
  },

  renderCounts(container: HTMLElement, counts: Record<string, number>, hidden: boolean): void {
    for (const v of VALUES) {
      const el = container.querySelector<HTMLElement>(`#f5f-count-${v}`);
      if (el) el.textContent = hidden ? '?' : String(counts[v] ?? 0);
    }
  },

  applyWinner(container: HTMLElement, _winner: string | null, show: boolean): void {
    for (const v of VALUES) {
      const btn = container.querySelector<HTMLElement>(`#f5f-option-${v}`);
      if (!btn) continue;
      const hasVotes = parseInt(container.querySelector(`#f5f-count-${v}`)?.textContent ?? '0', 10) > 0;
      btn.classList.toggle('f5f-no-votes', show && !hasVotes);
    }
  },

  renderVoters(container: HTMLElement, votes: Record<string, string>, participants: Record<string, string>, show: boolean): void {
    for (const v of VALUES) {
      const el = container.querySelector<HTMLElement>(`#f5f-voters-${v}`);
      if (!el) continue;
      if (!show) { el.hidden = true; continue; }
      const names = Object.entries(votes)
        .filter(([, vote]) => vote === v)
        .map(([id]) => participants[id])
        .filter(Boolean);
      el.hidden = names.length === 0;
      el.textContent = names.join(', ');
    }
  },
};
