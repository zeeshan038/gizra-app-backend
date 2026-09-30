/**
 * Avoid leaking Prisma/SQL internals to mobile clients.
 */
export function safeApiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const msg = error instanceof Error ? error.message : String(error);

  if (
    /Authentication failed against database|P1000|ECONNREFUSED|Can't reach database|password authentication failed/i.test(
      msg
    )
  ) {
    return 'Service temporarily unavailable. Please try again in a few minutes.';
  }

  if (process.env.NODE_ENV !== 'production') {
    return msg;
  }

  return fallback;
}
