import { orders } from '@prisma/client';

export function parseCookingMinutes(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Legacy PHP: first segment of restaurant `delivery_time` (e.g. `30-40` → `30`). */
export function defaultCookingMinutesFromDeliveryTime(
  deliveryTime: string | null | undefined
): string | null {
  if (!deliveryTime?.trim()) return null;
  const first = deliveryTime.split('-')[0]?.trim();
  if (!first) return null;
  const n = parseInt(first, 10);
  if (Number.isFinite(n) && n > 0) return String(n);
  return first.slice(0, 10);
}

export function normalizeProcessingTimeInput(input: unknown): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 999) return null;
  return String(n);
}

export function mapOrderCookingTimeForApi(order: orders) {
  const cooking_time_minutes = parseCookingMinutes(order.processing_time);
  const processing_started_at = order.processing?.toISOString() ?? null;
  let cooking_ready_by: string | null = null;
  if (cooking_time_minutes != null && order.processing) {
    cooking_ready_by = new Date(
      order.processing.getTime() + cooking_time_minutes * 60_000
    ).toISOString();
  }
  return {
    processing_time: order.processing_time ?? null,
    cooking_time_minutes,
    processing_started_at,
    cooking_ready_by,
  };
}

export function cookingTimePushDescription(minutes: number | null): string {
  if (minutes != null) {
    return `Restaurant started cooking — ready in about ${minutes} min`;
  }
  return 'Restaurant started cooking your order';
}
