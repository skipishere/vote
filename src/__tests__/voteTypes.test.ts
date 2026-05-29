import { describe, it, expect } from 'vitest';
import { leanCoffeeType } from '../voteTypes/leanCoffee';

describe('leanCoffeeType.computeResult', () => {
  it('returns zero counts for an empty vote', () => {
    const { counts } = leanCoffeeType.computeResult([]);
    expect(counts).toEqual({ up: 0, neutral: 0, down: 0 });
  });

  it('tallies votes correctly', () => {
    const { counts } = leanCoffeeType.computeResult(['up', 'up', 'neutral', 'down']);
    expect(counts).toEqual({ up: 2, neutral: 1, down: 1 });
  });

  it('returns up as winner when up votes dominate', () => {
    expect(leanCoffeeType.computeResult(['up', 'up', 'down']).winner).toBe('up');
  });

  it('returns down as winner when down votes dominate', () => {
    expect(leanCoffeeType.computeResult(['down', 'down']).winner).toBe('down');
  });

  it('ignores unknown vote values', () => {
    const { counts } = leanCoffeeType.computeResult(['up', 'invalid']);
    expect(counts.up).toBe(1);
    expect(counts.neutral).toBe(0);
    expect(counts.down).toBe(0);
  });
});

describe('leanCoffeeType.renderCounts', () => {
  function makeContainer() {
    const div = document.createElement('div');
    div.innerHTML = `
      <div id="lc-count-up">0</div>
      <div id="lc-count-neutral">0</div>
      <div id="lc-count-down">0</div>
    `;
    return div;
  }

  it('updates count elements with vote totals', () => {
    const c = makeContainer();
    leanCoffeeType.renderCounts(c, { up: 3, neutral: 1, down: 2 }, false);
    expect(c.querySelector('#lc-count-up')!.textContent).toBe('3');
    expect(c.querySelector('#lc-count-neutral')!.textContent).toBe('1');
    expect(c.querySelector('#lc-count-down')!.textContent).toBe('2');
  });

  it('shows "?" for all counts when hidden', () => {
    const c = makeContainer();
    leanCoffeeType.renderCounts(c, { up: 3, neutral: 1, down: 2 }, true);
    expect(c.querySelector('#lc-count-up')!.textContent).toBe('?');
    expect(c.querySelector('#lc-count-neutral')!.textContent).toBe('?');
    expect(c.querySelector('#lc-count-down')!.textContent).toBe('?');
  });
});

describe('leanCoffeeType.applyWinner', () => {
  function makeContainer() {
    const div = document.createElement('div');
    div.innerHTML = `
      <div id="ballot-lean-coffee">
        <div id="lc-option-up"></div>
        <div id="lc-option-neutral"></div>
        <div id="lc-option-down"></div>
      </div>
    `;
    return div;
  }

  it('adds winner class to the winning option', () => {
    const c = makeContainer();
    leanCoffeeType.applyWinner(c, 'up', true);
    expect(c.querySelector('#lc-option-up')!.classList.contains('winner')).toBe(true);
  });

  it('does not add winner class when show is false', () => {
    const c = makeContainer();
    leanCoffeeType.applyWinner(c, 'up', false);
    expect(c.querySelector('#lc-option-up')!.classList.contains('winner')).toBe(false);
  });

  it('removes previous winner class when called again', () => {
    const c = makeContainer();
    leanCoffeeType.applyWinner(c, 'up', true);
    leanCoffeeType.applyWinner(c, 'down', true);
    expect(c.querySelector('#lc-option-up')!.classList.contains('winner')).toBe(false);
    expect(c.querySelector('#lc-option-down')!.classList.contains('winner')).toBe(true);
  });
});
