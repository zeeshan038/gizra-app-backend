import { orders } from '@prisma/client';

function n(v: unknown): number {
  return Number(v) || 0;
}

/**
 * Food subtotal used for manual-dispatch commission (matches PHP `OrderLogic::create_transaction`).
 * Commission is **not** applied to delivery fee or tax.
 */
export function manualDispatchCommissionBase(order: {
  order_amount: unknown;
  additional_charge?: unknown;
  extra_packaging_amount?: unknown;
  delivery_charge?: unknown;
  total_tax_amount?: unknown;
  dm_tips?: unknown;
  coupon_discount_amount?: unknown;
  restaurant_discount_amount?: unknown;
  ref_bonus_amount?: unknown;
}): number {
  return (
    n(order.order_amount) -
    n(order.additional_charge) -
    n(order.extra_packaging_amount) -
    n(order.delivery_charge) -
    n(order.total_tax_amount) -
    n(order.dm_tips) +
    n(order.coupon_discount_amount) +
    n(order.restaurant_discount_amount) +
    n(order.ref_bonus_amount)
  );
}

export function manualDispatchGizraCharge(
  order: orders,
  commissionRatePercent: number
): { commission: number; delivery_fee: number; gizra_charge: number } {
  const base = manualDispatchCommissionBase(order);
  const rate = commissionRatePercent > 0 ? commissionRatePercent : 10;
  const commission = Math.round(base * (rate / 100) * 100) / 100;
  const delivery_fee = Math.round(n(order.original_delivery_charge || order.delivery_charge) * 100) / 100;
  const gizra_charge = Math.round((commission + delivery_fee) * 100) / 100;
  return { commission, delivery_fee, gizra_charge };
}
