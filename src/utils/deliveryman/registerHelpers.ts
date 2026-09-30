import { normalizeStoredMedia } from '../mediaStorage';

/** Map Figma / client aliases before Joi validation. */
export function normalizeDriverRegisterBody(body: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...body };

  if (normalized.fName != null && normalized.f_name == null) {
    normalized.f_name = normalized.fName;
  }
  if (normalized.lName != null && normalized.l_name == null) {
    normalized.l_name = normalized.lName;
  }
  if (normalized.first_name != null && normalized.f_name == null) {
    normalized.f_name = normalized.first_name;
  }
  if (normalized.last_name != null && normalized.l_name == null) {
    normalized.l_name = normalized.last_name;
  }

  if (normalized.city_id != null && normalized.zone_id == null) {
    normalized.zone_id = normalized.city_id;
  }

  if (normalized.delivery_type != null && normalized.earning == null) {
    const t = String(normalized.delivery_type).toLowerCase();
    if (t === 'salary') {
      normalized.earning = false;
    } else if (t === 'commission' || t === 'freelance') {
      normalized.earning = true;
    }
  }

  if (typeof normalized.earning === 'string') {
    const e = normalized.earning.toLowerCase();
    normalized.earning = e === '1' || e === 'true' || e === 'commission' || e === 'freelance';
  }
  if (normalized.earning === 0 || normalized.earning === '0') {
    normalized.earning = false;
  }
  if (normalized.earning === 1) {
    normalized.earning = true;
  }

  if (normalized.identity_images != null && normalized.identity_image == null) {
    normalized.identity_image = normalized.identity_images;
  }

  return normalized;
}

export function parseIdentityImagePaths(
  identity_image: string | string[] | null | undefined
): string[] {
  if (identity_image == null) return [];
  if (Array.isArray(identity_image)) {
    return identity_image.map((p) => String(p).trim()).filter(Boolean);
  }
  const single = String(identity_image).trim();
  if (!single) return [];
  if (single.startsWith('[')) {
    try {
      const parsed = JSON.parse(single);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => {
            if (typeof entry === 'string') return entry;
            if (entry && typeof entry === 'object' && 'img' in entry) {
              return String((entry as { img: string }).img);
            }
            return '';
          })
          .filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }
  return [single];
}

/**
 * Persist ID document path(s). Uses legacy `identity_image` column; overflow → `additional_documents`.
 */
export function packIdentityImagesForDb(paths: string[]): {
  identity_image: string;
  additional_documents: string | null;
} {
  const normalized = paths.map((p, i) =>
    normalizeStoredMedia(p, i === 0 ? 'placeholder_id.png' : 'placeholder_id2.png')
  );

  if (normalized.length === 0) {
    return { identity_image: 'placeholder_id.png', additional_documents: null };
  }

  const legacyJson = JSON.stringify(
    normalized.map((img) => ({ img, storage: 'r2' }))
  );

  if (legacyJson.length <= 191) {
    return { identity_image: legacyJson, additional_documents: null };
  }

  return {
    identity_image: normalized[0],
    additional_documents: JSON.stringify({ identity_images: normalized }),
  };
}
