import { describe, expect, it } from 'vitest';
import { mapWithLimit } from '../src/core/async';

/** Resolves after `ms`, recording how many calls were in flight at once. */
function tracker(limit: { peak: number; active: number }) {
  return async (value: number) => {
    limit.active++;
    limit.peak = Math.max(limit.peak, limit.active);
    await new Promise(resolve => setTimeout(resolve, 5));
    limit.active--;
    return value * 2;
  };
}

describe('mapWithLimit', () => {
  it('returns results in input order, not completion order', async () => {
    const results = await mapWithLimit([1, 2, 3, 4, 5], 2, async value => {
      await new Promise(resolve => setTimeout(resolve, (5 - value) * 3));
      return value;
    });
    expect(results).toEqual([1, 2, 3, 4, 5]);
  });

  it('never runs more than `limit` tasks at once', async () => {
    const state = { peak: 0, active: 0 };
    await mapWithLimit([1, 2, 3, 4, 5, 6, 7, 8], 3, tracker(state));
    expect(state.peak).toBe(3);
  });

  it('reports progress once per item', async () => {
    let settled = 0;
    await mapWithLimit([1, 2, 3], 2, async v => v, () => settled++);
    expect(settled).toBe(3);
  });

  it('handles an empty list without hanging', async () => {
    expect(await mapWithLimit([], 4, async v => v)).toEqual([]);
  });

  it('handles fewer items than the limit', async () => {
    expect(await mapWithLimit([1, 2], 10, async v => v * 2)).toEqual([2, 4]);
  });
});
