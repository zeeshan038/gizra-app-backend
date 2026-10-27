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

/** POS apps may send snake_case or camelCase — do not rely on Joi stripUnknown for aliases. */
export function resolveProcessingTimeFromRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const candidates = [
    b.processing_time,
    b.processingTime,
    b.cooking_time,
    b.cookingTime,
    b.cooking_time_minutes,
    b.cookingTimeMinutes,
  ];
  for (const raw of candidates) {
    const normalized = normalizeProcessingTimeInput(raw);
    if (normalized) return normalized;
  }
  return null;
}

export function mapOrderCookingTimeForApi(order: orders) {
  const inactive = {
    processing_time: null as string | null,
    cooking_time_minutes: null as number | null,
    processing_started_at: null as string | null,
    cooking_ready_by: null as string | null,
    cooking_minutes_remaining: null as number | null,
  };

  if (order.order_status !== 'processing' || order.processing == null) {
    return inactive;
  }

  const cooking_time_minutes = parseCookingMinutes(order.processing_time);
  const processing_started_at = order.processing.toISOString();
  let cooking_ready_by: string | null = null;
  let cooking_minutes_remaining: number | null = null;

  if (cooking_time_minutes != null) {
    const readyAt = order.processing.getTime() + cooking_time_minutes * 60_000;
    cooking_ready_by = new Date(readyAt).toISOString();
    cooking_minutes_remaining = Math.max(0, Math.ceil((readyAt - Date.now()) / 60_000));
  }

  return {
    processing_time: order.processing_time ?? null,
    cooking_time_minutes,
    processing_started_at,
    cooking_ready_by,
    cooking_minutes_remaining,
  };
}

export function cookingTimePushDescription(minutes: number | null): string {
  if (minutes != null) {
    return `Restaurant started cooking — ready in about ${minutes} min`;
  }
  return 'Restaurant started cooking your order';
}
