import { parseJsonObject } from './restaurantSetup/helpers';

/**
 * POS app toggles (Flutter previously stored these in SharedPreferences only).
 * Persisted under restaurants.additional_data.pos_app_settings — no schema migration.
 */
export type PosAppSettings = {
  autoAcceptOrder: boolean;
  autoPrintOnAccept: boolean;
  use58mmPaper: boolean;
};

/** Match legacy Flutter defaults: auto_accept=false, auto_print=false, is_58mm=true */
export const DEFAULT_POS_APP_SETTINGS: PosAppSettings = {
  autoAcceptOrder: false,
  autoPrintOnAccept: false,
  use58mmPaper: true,
};

export function normalizePosAppSettings(
  input: Partial<PosAppSettings> | Record<string, unknown> | null | undefined
): PosAppSettings {
  const src = input && typeof input === 'object' ? input : {};
  const asBool = (v: unknown, fallback: boolean) =>
    v === undefined ? fallback : Boolean(v);

  return {
    autoAcceptOrder: asBool(
      (src as PosAppSettings).autoAcceptOrder ?? (src as Record<string, unknown>).auto_accept_order,
      DEFAULT_POS_APP_SETTINGS.autoAcceptOrder
    ),
    autoPrintOnAccept: asBool(
      (src as PosAppSettings).autoPrintOnAccept ??
        (src as Record<string, unknown>).auto_print_on_accept,
      DEFAULT_POS_APP_SETTINGS.autoPrintOnAccept
    ),
    use58mmPaper: asBool(
      (src as PosAppSettings).use58mmPaper ?? (src as Record<string, unknown>).use_58mm_paper,
      DEFAULT_POS_APP_SETTINGS.use58mmPaper
    ),
  };
}

export function readPosAppSettingsFromAdditionalData(
  additionalData: string | null | undefined
): PosAppSettings {
  const root = parseJsonObject(additionalData);
  const nested = root.pos_app_settings;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return normalizePosAppSettings(nested as Record<string, unknown>);
  }
  return { ...DEFAULT_POS_APP_SETTINGS };
}

export function mergePosAppSettingsIntoAdditionalData(
  additionalData: string | null | undefined,
  settings: PosAppSettings
): string {
  const root = parseJsonObject(additionalData);
  root.pos_app_settings = settings;
  return JSON.stringify(root);
}
