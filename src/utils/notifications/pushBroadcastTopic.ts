export type PushBroadcastTarget = 'customer' | 'deliveryman' | 'restaurant';

const ALL_ZONE_TOPICS: Record<PushBroadcastTarget, string> = {
  customer: 'all_zone_customer',
  deliveryman: 'all_zone_delivery_man',
  restaurant: 'all_zone_restaurant',
};

/** Legacy PHP admin notification topics (`NotificationController::store`). */
export function resolvePushBroadcastTopic(
  tergat: PushBroadcastTarget,
  zone: 'all' | number
): string {
  if (zone === 'all') {
    return ALL_ZONE_TOPICS[tergat];
  }
  const suffix =
    tergat === 'customer' ? 'customer' : tergat === 'deliveryman' ? 'delivery_man' : 'restaurant';
  return `zone_${zone}_${suffix}`;
}
