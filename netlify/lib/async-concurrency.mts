/** Runs independent async tasks with a fixed concurrency ceiling and stable result ordering. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R> | R
): Promise<R[]> {
  if (!Array.isArray(items) || !Number.isSafeInteger(concurrency) ||
      concurrency < 1 || concurrency > 32 || typeof mapper !== "function") {
    throw new Error("invalid_bounded_concurrency_arguments");
  }
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}
