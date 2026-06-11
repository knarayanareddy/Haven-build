export async function captureException(error: unknown, context: Record<string, unknown> = {}) {
  const dsn = Deno.env.get('SENTRY_DSN');
  if (!dsn) return;
  await fetch(dsn, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: String((error as Error)?.message ?? error),
      level: 'error',
      platform: 'deno',
      extra: scrub(context),
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => undefined);
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = /email|phone|name|token|transcript|audio|address/i.test(k) ? '[redacted]' : scrub(v);
    return out;
  }
  return value;
}
