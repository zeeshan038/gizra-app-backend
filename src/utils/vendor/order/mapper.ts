import { orders, order_details, food } from '@prisma/client';

export type OrderCustomerBrief = {
  f_name: string | null;
  l_name: string | null;
  phone: string | null;
  email?: string | null;
};

export function formatCustomerName(customer?: OrderCustomerBrief | null): string {
  if (!customer) return 'Guest';
  return [customer.f_name, customer.l_name].filter(Boolean).join(' ') || 'Customer';
}

export function mapOrderSummary(order: orders, customer?: OrderCustomerBrief | null) {
  return {
    id: order.id.toString(),
    user_id: order.user_id?.toString() ?? null,
    restaurant_id: order.restaurant_id?.toString() ?? null,
    order_amount: Number(order.order_amount) || 0,
    order_status: order.order_status,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    order_type: order.order_type,
    scheduled: order.scheduled,
    checked: order.checked,
    created_at: order.created_at,
    customer_name: formatCustomerName(customer),
    customer_phone: customer?.phone ?? null,
  };
}

export function mapOrderLineItem(
  row: order_details,
  foodRow?: Pick<food, 'id' | 'name' | 'image'> | null
) {
  return {
    id: row.id.toString(),
    food_id: row.food_id?.toString() ?? null,
    food_name: foodRow?.name ?? 'Item',
    food_image: foodRow?.image ?? null,
    price: Number(row.price),
    quantity: Number(row.quantity),
    variation: row.variation,
    add_ons: row.add_ons,
    tax_amount: Number(row.tax_amount),
    total_add_on_price: Number(row.total_add_on_price),
  };
}
