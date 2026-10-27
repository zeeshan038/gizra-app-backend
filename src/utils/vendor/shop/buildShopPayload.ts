import prisma from '../../../config/database';
import { getBusinessSettingNumber } from '../../consumer/businessSettings';
import { asNumber } from '../restaurantSetup/helpers';
import { RESTAURANT_TRANSLATION_TYPE } from '../../../types/vendor/restaurantSetup';
import { publicRestaurantMediaUrl } from '../../mediaStorage';
import { restaurants } from '@prisma/client';

export type VendorShopPayload = {
  name: string;
  createdAtLabel: string;
  coverPhotoUrl: string | null;
  logoUrl: string | null;
  businessModel: string;
  adminCommission: string;
  tax: string;
  phone: string;
  address: string;
  announcement: boolean;
  announcementMessage: string;
  cloudflareId: string | null;
  translations: {
    en: { name: string; address: string };
    he: { name: string; address: string };
  };
};

function formatCreatedAt(value: Date | null | undefined): string {
  if (!value) return '';
  const day = value.getDate();
  const month = value.toLocaleDateString('en-GB', { month: 'short' });
  const year = value.getFullYear();
  const time = value.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${day} ${month} ${year} ${time}`;
}

function formatBusinessModel(model: string | null | undefined): string {
  if (model === 'commission') return 'Commission Base';
  if (model === 'subscription') return 'Subscription Base';
  if (model === 'unsubscribed') return 'Unsubscribed';
  if (model === 'none') return 'None';
  if (!model) return 'Commission Base';
  return model
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function emptyTranslations() {
  return {
    en: { name: '', address: '' },
    he: { name: '', address: '' },
  };
}

export async function buildVendorShopPayload(
  restaurant: restaurants
): Promise<VendorShopPayload> {
  const rid = Number(restaurant.id);
  const [translationRows, adminCommissionDefault, vendor] = await Promise.all([
    prisma.translations.findMany({
      where: {
        translationable_type: RESTAURANT_TRANSLATION_TYPE,
        translationable_id: rid,
        key: { in: ['name', 'address'] },
        locale: { in: ['en', 'he'] },
      },
    }),
    getBusinessSettingNumber('admin_commission', 0),
    prisma.vendors.findFirst({
      where: { id: BigInt(Number(restaurant.vendor_id)) },
      select: { cloudflareId: true },
    }),
  ]);

  const translations = emptyTranslations();
  for (const row of translationRows) {
    const locale = row.locale as 'en' | 'he';
    if (locale !== 'en' && locale !== 'he') continue;
    if (row.key === 'name') translations[locale].name = row.value || '';
    if (row.key === 'address') translations[locale].address = row.value || '';
  }

  const commission =
    restaurant.comission != null ? asNumber(restaurant.comission) : adminCommissionDefault;

  return {
    name: restaurant.name,
    createdAtLabel: formatCreatedAt(restaurant.created_at),
    coverPhotoUrl: publicRestaurantMediaUrl(restaurant.cover_photo, 'cover'),
    logoUrl: publicRestaurantMediaUrl(restaurant.logo, 'logo'),
    cloudflareId: vendor?.cloudflareId ?? null,
    businessModel: formatBusinessModel(restaurant.restaurant_model),
    adminCommission: formatPercent(commission),
    tax: formatPercent(asNumber(restaurant.tax)),
    phone: restaurant.phone,
    address: restaurant.address || '',
    announcement: restaurant.announcement,
    announcementMessage: restaurant.announcement_message || '',
    translations,
  };
}
