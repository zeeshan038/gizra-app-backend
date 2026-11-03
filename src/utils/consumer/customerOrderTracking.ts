/** Customer order tracking — Pending → Accept → Preparing → Ready For Pickup → On The Way → Completed */

const TRACKING_MESSAGES: Record<string, string> = {
  pending: 'Your order is pending.',
  confirmed: 'Your order has been accepted by the restaurant.',
  accepted: 'A delivery partner has accepted your order.',
  processing: 'Your order is being prepared.',
  handover: 'Your order is ready for pickup.',
  picked_up: 'Your order is on the way.',
  food_on_the_way: 'Your order is on the way.',
  delivered: 'Your order has been completed.',
  canceled: 'Your order has been canceled.',
  failed: 'Payment failed for this order.',
};

export function customerTrackingStep(orderStatus: string): number {
  switch (orderStatus) {
    case 'pending':
      return 1;
    case 'confirmed':
    case 'accepted':
      return 2;
    case 'processing':
      return 3;
    case 'handover':
      return 4;
    case 'picked_up':
    case 'food_on_the_way':
      return 5;
    case 'delivered':
      return 6;
    case 'canceled':
    case 'failed':
      return 1;
    default:
      return 1;
  }
}

export function customerTrackingLabel(orderStatus: string): string {
  switch (orderStatus) {
    case 'pending':
      return 'Pending';
    case 'confirmed':
    case 'accepted':
      return 'Accept';
    case 'processing':
      return 'Preparing';
    case 'handover':
      return 'Ready For Pickup';
    case 'picked_up':
    case 'food_on_the_way':
      return 'On The Way';
    case 'delivered':
      return 'Completed';
    case 'canceled':
      return 'Canceled';
    case 'failed':
      return 'Payment Failed';
    default:
      return orderStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function customerTrackingCopy(orderStatus: string): {
  status_label: string;
  message: string;
  tracking_step: number;
} {
  const tracking_step = customerTrackingStep(orderStatus);
  const status_label = customerTrackingLabel(orderStatus);
  const message =
    TRACKING_MESSAGES[orderStatus] ??
    `Order status: ${status_label}`;
  return { status_label, message, tracking_step };
}

/** List/history rows — same labels as tracking screen. */
export function customerOrderStatusLabel(orderStatus: string): string {
  return customerTrackingLabel(orderStatus);
}
