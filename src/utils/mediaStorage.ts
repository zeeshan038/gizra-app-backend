/**
 * Normalize client/upload values for legacy VarChar image columns (PHP-style paths or short filenames).
 */
export function normalizeStoredMedia(
  incoming: string | null | undefined,
  fallback: string,
  maxLen = 191
): string {
  const raw = incoming?.trim();
  if (!raw) return fallback;

  let stored = raw;
  if (stored.startsWith('http://') || stored.startsWith('https://')) {
    try {
      stored = new URL(stored).pathname.replace(/^\//, '');
    } catch {
      stored = raw;
    }
  }

  if (stored.length > maxLen) {
    const file = stored.split('/').pop() || stored;
    stored = file.length <= maxLen ? file : file.slice(0, maxLen);
  }

  return stored || fallback;
}

export function publicMediaUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith('http://') || stored.startsWith('https://')) return stored;
  const base = (process.env.CLOUDFLARE_PUBLIC_URL || '').replace(/\/$/, '');
  if (!base) return stored;
  const path = stored.replace(/^\//, '');
  return `${base}/${path}`;
}
