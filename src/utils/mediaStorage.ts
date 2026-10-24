/**
 * Normalize client/upload values for legacy VarChar image columns (PHP-style paths or short filenames).
 */
/** Trim and fit a value into a legacy VarChar column (avoids Prisma P2000). */
export function fitDbString(value: string | null | undefined, maxLen: number): string | null {
  if (value == null) return null;
  const s = value.trim();
  if (!s) return null;
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

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

/** Laravel food images live under storage/app/public/product/ */
export function publicFoodMediaUrl(stored: string | null | undefined): string | null {
  const raw = stored?.trim();
  if (!raw) return null;
  const path = raw.includes('/') ? raw : `product/${raw}`;
  return publicMediaUrl(path);
}

const RESTAURANT_LOGO_PLACEHOLDERS = new Set(['default_logo.png', 'default.png']);
const RESTAURANT_COVER_PLACEHOLDERS = new Set(['default_cover.png']);

/** Resolve restaurant logo/cover DB values (legacy filename or R2 path) to a public URL. */
export function publicRestaurantMediaUrl(
  stored: string | null | undefined,
  kind: 'logo' | 'cover'
): string | null {
  const raw = stored?.trim();
  if (!raw) return null;

  const placeholders = kind === 'logo' ? RESTAURANT_LOGO_PLACEHOLDERS : RESTAURANT_COVER_PLACEHOLDERS;
  if (placeholders.has(raw.toLowerCase())) return null;

  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;

  let path = raw.replace(/^\//, '');
  if (!path.includes('/')) {
    path = kind === 'logo' ? `restaurant/${path}` : `restaurant/cover/${path}`;
  }

  return publicMediaUrl(path);
}
