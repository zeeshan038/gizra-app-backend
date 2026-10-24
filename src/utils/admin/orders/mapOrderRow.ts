import { orders } from '@prisma/client';
import { parseDeliveryAddress } from '../../vendor/order/detailMapper';
import { formatCustomerName, OrderCustomerBrief } from '../../vendor/order/mapper';

function customerFromDeliveryAddress(order: orders): OrderCustomerBrief | null {
  const raw = order.delivery_address?.trim();
  if (!raw) return null;
  const addr = parseDeliveryAddress(raw);
  if (!addr?.contact_person_name && !addr?.contact_person_number) return null;
  const parts = (addr.contact_person_name ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    f_name: parts[0] ?? addr.contact_person_name ?? null,
    l_name: parts.length > 1 ? parts.slice(1).join(' ') : null,
    phone: addr.contact_person_number ?? null,
  };
}

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
  const guestCustomer =
    !customer || formatCustomerName(customer) === 'Guest' ? customerFromDeliveryAddress(order) : null;
  const resolvedCustomer = guestCustomer ?? customer;

  return {
    id: order.id.toString(),
    created_at: order.created_at?.toISOString() ?? null,
    customer_name: formatCustomerName(resolvedCustomer),
    customer_phone: resolvedCustomer?.phone ?? null,
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
