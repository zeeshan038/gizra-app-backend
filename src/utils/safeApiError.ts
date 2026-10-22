const TRANSIENT_DB_RE =
  /P1001|P2024|Can't reach database|ECONNREFUSED/i;

/** Connection blips only — P1010/denied access is a server grant/password fix, not retryable. */
const RETRYABLE_AUTH_RE = /P1000|Authentication failed against database|password authentication failed/i;

export function isTransientDbError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
  if (TRANSIENT_DB_RE.test(code)) return true;
  const msg = error instanceof Error ? error.message : String(error);
  if (TRANSIENT_DB_RE.test(msg)) return true;
  if (/denied access on the database|P1010/i.test(msg)) return false;
  return RETRYABLE_AUTH_RE.test(code) || RETRYABLE_AUTH_RE.test(msg);
}

/**
 * Avoid leaking Prisma/SQL internals to mobile clients.
 */
export function safeApiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isTransientDbError(error)) {
    return 'Service temporarily unavailable. Please try again in a few minutes.';
  }

  const msg = error instanceof Error ? error.message : String(error);

  if (process.env.NODE_ENV !== 'production') {
    return msg;
  }

  return fallback;
}
