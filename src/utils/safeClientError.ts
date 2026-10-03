/** Log full error server-side; never return Prisma/stack traces to clients. */
export function clientSafeErrorMessage(error: unknown, fallback = 'Service temporarily unavailable.'): string {
  if (error instanceof Error) {
    const m = error.message;
    if (/P1000|P1001|Authentication failed|Can't reach database|ECONNREFUSED/i.test(m)) {
      return fallback;
    }
  }
  return fallback;
}
