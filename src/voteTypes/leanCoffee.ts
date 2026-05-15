import type { VoteTypeDefinition, VoteResult } from './definition';
import ballotHtml from '../views/ballot-lean-coffee.html?raw';

export const leanCoffeeType: VoteTypeDefinition = {
  id: 'lean-coffee',
  label: 'Lean Coffee (Continue · Either way · Move on)',
  headerLabel: '☕ Lean Coffee Vote',
  ballotHtml,
  values: ['up', 'neutral', 'down'],

  computeResult(votes: string[]): VoteResult {
    const counts: Record<string, number> = { up: 0, neutral: 0, down: 0 };
    let score = 0;
    for (const v of votes) {
      if (v in counts) counts[v]++;
      score += v === 'up' ? 1 : v === 'down' ? -1 : 0;
    }
    return { counts, winner: score > 0 ? 'up' : 'down' };
  },

  renderCounts(container: HTMLElement, counts: Record<string, number>, hidden: boolean): void {
    for (const key of ['up', 'neutral', 'down'] as const) {
      const el = container.querySelector<HTMLElement>(`#lc-count-${key}`);
      if (el) el.textContent = hidden ? '?' : String(counts[key] ?? 0);
    }
  },

  applyWinner(container: HTMLElement, winner: string | null, show: boolean): void {
    for (const key of ['up', 'neutral', 'down']) {
      container.querySelector(`#lc-option-${key}`)?.classList.remove('winner');
    }
    const ballot = container.querySelector('#ballot-lean-coffee');
    ballot?.classList.toggle('has-winner', show && winner !== null);
    if (show && winner !== null) {
      container.querySelector(`#lc-option-${winner}`)?.classList.add('winner');
    }
  },
};
