/**
 * How many pub.dev requests run at once during a refresh. Four is roughly 4x
 * faster than checking packages one by one and pub.dev is fine with it.
 */
export const CONCURRENT_REQUESTS = 4;

/**
 * Runs `task` over every item, at most `limit` at a time.
 *
 * pub.dev is happy with a handful of parallel requests and much slower one at
 * a time. Results come back in input order; `onSettled` fires as each item
 * finishes, which is what drives the progress bar.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
  onSettled?: () => void
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
      onSettled?.();
    }
  };

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}
