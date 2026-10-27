import prisma from '../../config/database';

/** PHP Helpers::visitor_log — increment restaurant visit count for a registered customer. */
export async function recordRestaurantVisit(userId: number, restaurantId: number): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(restaurantId)) return;

  const existing = await prisma.visitor_logs.findFirst({
    where: {
      visitor_log_type: 'App\\Models\\Restaurant',
      visitor_log_id: restaurantId,
      user_id: userId,
    },
  });

  const now = new Date();
  if (existing) {
    await prisma.visitor_logs.update({
      where: { id: existing.id },
      data: {
        visit_count: { increment: 1 },
        updated_at: now,
      },
    });
    return;
  }

  await prisma.visitor_logs.create({
    data: {
      visitor_log_type: 'App\\Models\\Restaurant',
      visitor_log_id: restaurantId,
      user_id: userId,
      visit_count: 1,
      order_count: 0,
      created_at: now,
      updated_at: now,
    },
  });
}
