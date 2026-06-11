export async function withRetry<T>(fn: () => Promise<T>, options: { attempts?: number; baseDelayMs?: number } = {}) {
  const attempts = options.attempts ?? 3;
  const base = options.baseDelayMs ?? 250;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (error) {
      last = error;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, base * Math.pow(2, i)));
    }
  }
  throw last;
}
