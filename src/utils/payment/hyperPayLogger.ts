/** Structured HyperPay logs — visible via `docker logs -f gizra-backend`. */

const REDACT = new Set([
  'KEY',
  'PassP',
  'PassP2',
  'apiKey',
  'signature',
  'Sign',
]);

function sanitizeValue(key: string, value: unknown): unknown {
  if (REDACT.has(key)) {
    const s = String(value ?? '');
    if (s.length <= 8) return '***';
    return `${s.slice(0, 4)}…${s.slice(-4)}`;
  }
  return value;
}

export function sanitizeHypParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = sanitizeValue(k, v);
  }
  return out;
}

export function hyperPayLog(
  tag: string,
  data?: Record<string, unknown>
): void {
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[hyperpay] ${tag}${payload}`);
}
