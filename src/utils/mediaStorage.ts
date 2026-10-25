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
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const path = raw.includes('/') ? raw : `product/${raw}`;
  return publicMediaUrl(path);
}

/** Category tiles (home + restaurant menu chips). */
export function publicCategoryMediaUrl(stored: string | null | undefined): string | null {
  const raw = stored?.trim();
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const path = raw.startsWith('category/') ? raw : `category/${raw}`;
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

/** Consumer/mobile: resolve logo & cover to public URLs (apps often read `logo`, not `logo_full_url`). */
export function consumerRestaurantMediaFields(stored: {
  logo: string | null | undefined;
  cover_photo?: string | null | undefined;
}): {
  logo: string | null;
  logo_full_url: string | null;
  cover_photo?: string | null;
  cover_photo_full_url?: string | null;
} {
  const logoFullUrl = publicRestaurantMediaUrl(stored.logo, 'logo');
  const out: {
    logo: string | null;
    logo_full_url: string | null;
    cover_photo?: string | null;
    cover_photo_full_url?: string | null;
  } = {
    logo: logoFullUrl,
    logo_full_url: logoFullUrl,
  };
  if (stored.cover_photo !== undefined) {
    const coverFullUrl = publicRestaurantMediaUrl(stored.cover_photo, 'cover');
    out.cover_photo = coverFullUrl;
    out.cover_photo_full_url = coverFullUrl;
  }
  return out;
}

/** Consumer/mobile: `image` and `image_full_url` for category rows. */
export function consumerCategoryMediaFields(stored: string | null | undefined): {
  image: string | null;
  image_full_url: string | null;
} {
  const url = publicCategoryMediaUrl(stored);
  return { image: url, image_full_url: url };
}

/** Consumer/mobile: `image` and `image_full_url` for food rows. */
export function consumerFoodMediaFields(stored: string | null | undefined): {
  image: string | null;
  image_full_url: string | null;
} {
  const url = publicFoodMediaUrl(stored);
  return { image: url, image_full_url: url };
}
