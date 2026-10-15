import type { coupons } from '@prisma/client';
import {
  loadCouponTitleTranslations,
  normalizeDiscountType,
} from '../../vendor/coupon/translations';

export function parseCouponDataField(data: string | null): number[] {
  if (!data?.trim()) return [];
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed.map((id) => Number(id)).filter(Number.isFinite);
    return [];
  } catch {
    return [];
  }
}

export function parseCustomerIdsField(customer_id: string | null): Array<number | 'all'> {
  try {
    const parsed = JSON.parse(customer_id ?? '["all"]');
    if (!Array.isArray(parsed)) return ['all'];
    return parsed.map((v) => (v === 'all' ? 'all' : Number(v))).filter(
      (v) => v === 'all' || Number.isFinite(v as number)
    );
  } catch {
    return ['all'];
  }
}

export function encodeCouponData(
  coupon_type: string,
  zone_ids?: number[],
  restaurant_ids?: number[]
): string {
  if (coupon_type === 'zone_wise') return JSON.stringify(zone_ids ?? []);
  if (coupon_type === 'restaurant_wise') return JSON.stringify(restaurant_ids ?? []);
  return JSON.stringify('');
}

export function customerTypeLabel(customerIds: Array<number | 'all'>): 'all' | 'selected' {
  if (customerIds.includes('all')) return 'all';
  return 'selected';
}

export async function formatAdminCouponRow(row: coupons) {
  const titles = await loadCouponTitleTranslations(row.id, row.title);
  const zone_ids = row.coupon_type === 'zone_wise' ? parseCouponDataField(row.data) : [];
  const restaurant_ids =
    row.coupon_type === 'restaurant_wise' ? parseCouponDataField(row.data) : [];
  const customer_ids = parseCustomerIdsField(row.customer_id);

  const discountType =
    row.discount_type === 'percentage' ? 'percent' : row.discount_type ?? 'amount';

  return {
    id: Number(row.id),
    title: row.title,
    titles,
    code: row.code,
    coupon_type: row.coupon_type,
    zone_ids,
    restaurant_ids,
    customer_ids,
    customer_type: customerTypeLabel(customer_ids),
    limit: row.limit != null ? Number(row.limit) : null,
    start_date: row.start_date,
    expire_date: row.expire_date,
    min_purchase: Number(row.min_purchase),
    max_discount: Number(row.max_discount),
    discount: Number(row.discount),
    discount_type: discountType,
    status: row.status,
    total_uses: row.total_uses != null ? Number(row.total_uses) : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export { normalizeDiscountType };
