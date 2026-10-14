import { orders } from '@prisma/client';
import { formatCustomerName, OrderCustomerBrief } from '../../vendor/order/mapper';

export type AdminOrderListRow = {
  id: string;
  created_at: string | null;
  customer_name: string;
  customer_phone: string | null;
  restaurant_id: string;
  restaurant_name: string;
  order_amount: number;
  payment_status: string;
  order_status: string;
  order_type: string;
  is_manual_dispatch: boolean;
  delivery_man_id: string | null;
  zone_id: string | null;
  checked: boolean;
};

export function mapAdminOrderListRow(
  order: orders,
  restaurantName: string,
  customer: OrderCustomerBrief | null
): AdminOrderListRow {
  return {
    id: order.id.toString(),
    created_at: order.created_at?.toISOString() ?? null,
    customer_name: formatCustomerName(customer),
    customer_phone: customer?.phone ?? null,
    restaurant_id: order.restaurant_id.toString(),
    restaurant_name: restaurantName,
    order_amount: Number(order.order_amount) || 0,
    payment_status: order.payment_status,
    order_status: order.order_status,
    order_type: order.order_type,
    is_manual_dispatch: order.is_manual_dispatch,
    delivery_man_id: order.delivery_man_id?.toString() ?? null,
    zone_id: order.zone_id?.toString() ?? null,
    checked: order.checked,
  };
}
