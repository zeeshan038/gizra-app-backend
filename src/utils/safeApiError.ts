const TRANSIENT_DB_RE =
  /P1000|P1001|P1010|P2024|Authentication failed against database|denied access on the database|Can't reach database|ECONNREFUSED|password authentication failed/i;

/** Prisma P1000/P1010 and pool errors after Postgres password/grant repair. */
export function isTransientDbError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
  if (TRANSIENT_DB_RE.test(code)) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return TRANSIENT_DB_RE.test(msg);
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
