import { orders } from '@prisma/client';

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Items + addons after discounts, derived from stored order totals (no line items). */
export function deriveOrderValueFromOrder(order: orders): number {
  const orderAmount = Number(order.order_amount) || 0;
  const tax = Number(order.total_tax_amount) || 0;
  const delivery = Number(order.delivery_charge) || 0;
  const tips = Number(order.dm_tips) || 0;
  const additional = Number(order.additional_charge) || 0;
  const packaging = Number(order.extra_packaging_amount) || 0;
  return roundMoney(Math.max(0, orderAmount - tax - delivery - tips - additional - packaging));
}

/** Restaurant order list: order value + delivery (tax excluded from this figure). */
export function deriveRestaurantListTotal(order: orders): number {
  const orderValue = deriveOrderValueFromOrder(order);
  const delivery = Number(order.delivery_charge) || 0;
  return roundMoney(orderValue + delivery);
}

const RESTAURANT_TAX_PERCENT = 10;

export function taxOnOrderValue(orderValue: number): number {
  return roundMoney((orderValue * RESTAURANT_TAX_PERCENT) / 100);
}

export function gizraPaysRestaurant(orderValue: number): number {
  return roundMoney(Math.max(0, orderValue - taxOnOrderValue(orderValue)));
}
