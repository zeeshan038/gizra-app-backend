/** Semver-like strings for mobile force-update (config API + admin). */

export function normalizeAppVersionString(
  raw: string | null | undefined,
  fallback = '0.0.0'
): string {
  if (raw == null || String(raw).trim() === '') return fallback;
  const trimmed = String(raw).trim();
  const parts = trimmed.split('.').map((p) => p.trim()).filter((p) => p !== '');
  if (!parts.length) return fallback;
  if (parts.length === 1 && /^\d+$/.test(parts[0])) {
    return `${parts[0]}.0.0`;
  }
  if (parts.length === 2 && parts.every((p) => /^\d+$/.test(p))) {
    return `${parts[0]}.${parts[1]}.0`;
  }
  return trimmed;
}

function parseVersionParts(version: string): number[] {
  const normalized = normalizeAppVersionString(version);
  return normalized.split('.').map((p) => {
    const n = Number(p);
    return Number.isFinite(n) ? n : 0;
  });
}

/** -1 if a < b, 0 if equal, 1 if a > b (missing segments treated as 0). */
export function compareAppVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

/**
 * Mobile update rule:
 * 1. installed version < minimum version → update required
 * 2. versions equal and installed build < minimum build → update required
 * 3. installed version > minimum version → allow (ignore build)
 */
export function isAppUpdateRequired(params: {
  installedVersion: string;
  installedBuild: number;
  minimumVersion: string;
  minimumBuild: number;
}): boolean {
  const cmp = compareAppVersions(params.installedVersion, params.minimumVersion);
  if (cmp < 0) return true;
  if (cmp > 0) return false;
  const build = Math.floor(Number(params.installedBuild) || 0);
  const minBuild = Math.floor(Number(params.minimumBuild) || 0);
  return build < minBuild;
}
