import { getDataSettingLocalized, getDataSettingRaw } from './dataSettings';

export type LegalPageSlug =
  | 'terms-and-conditions'
  | 'privacy-policy'
  | 'about-us'
  | 'refund-policy'
  | 'shipping-policy'
  | 'cancellation-policy';

export type LegalPageDefinition = {
  slug: LegalPageSlug;
  key: string;
  title: string;
  statusKey?: string;
};

export const LEGAL_PAGES: LegalPageDefinition[] = [
  { slug: 'terms-and-conditions', key: 'terms_and_conditions', title: 'Terms and conditions' },
  { slug: 'privacy-policy', key: 'privacy_policy', title: 'Privacy policy' },
  { slug: 'about-us', key: 'about_us', title: 'About us' },
  {
    slug: 'refund-policy',
    key: 'refund_policy',
    title: 'Refund policy',
    statusKey: 'refund_policy_status',
  },
  {
    slug: 'shipping-policy',
    key: 'shipping_policy',
    title: 'Shipping policy',
    statusKey: 'shipping_policy_status',
  },
  {
    slug: 'cancellation-policy',
    key: 'cancellation_policy',
    title: 'Cancellation policy',
    statusKey: 'cancellation_policy_status',
  },
];

const bySlug = new Map(LEGAL_PAGES.map((p) => [p.slug, p]));

export function resolveLegalPageSlug(raw: string): LegalPageDefinition | null {
  const normalized = raw.trim().toLowerCase().replace(/_/g, '-');
  return bySlug.get(normalized as LegalPageSlug) ?? null;
}

export async function loadLegalPageContent(
  def: LegalPageDefinition,
  locale?: string
): Promise<{ key: string; title: string; content: string; active: boolean }> {
  const content = await getDataSettingLocalized(def.key, locale);
  let active = true;
  if (def.statusKey) {
    const statusRaw = await getDataSettingRaw(def.statusKey);
    active = Number(statusRaw) === 1;
  }
  return {
    key: def.key,
    title: def.title,
    content,
    active,
  };
}

export async function loadAllLegalPages(locale?: string): Promise<
  Record<
    string,
    {
      title: string;
      content: string;
      active: boolean;
    }
  >
> {
  const out: Record<string, { title: string; content: string; active: boolean }> = {};
  for (const def of LEGAL_PAGES) {
    const row = await loadLegalPageContent(def, locale);
    out[def.key] = {
      title: row.title,
      content: row.content,
      active: row.active,
    };
  }
  return out;
}
