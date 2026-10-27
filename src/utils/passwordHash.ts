import bcrypt from 'bcrypt';

/**
 * Laravel / PHP password_hash() uses the $2y$ bcrypt prefix.
 * Node bcrypt (v6+) only accepts $2a$ / $2b$, and compare() returns false for $2y$.
 */
export function normalizeBcryptHash(stored: string): string {
  if (stored.startsWith('$2y$')) {
    return `$2a$${stored.slice(4)}`;
  }
  return stored;
}

export async function verifyPassword(
  plain: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored || !plain) return false;
  try {
    return await bcrypt.compare(plain, normalizeBcryptHash(stored));
  } catch (err) {
    console.error('[password] bcrypt compare failed', err);
    return false;
  }
}
