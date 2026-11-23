import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';

export async function findActivePosConnection(restaurantId: number) {
  return prisma.partner_webhooks.findFirst({
    where: {
      restaurant_id: new Prisma.Decimal(restaurantId),
      active: true,
      disabled_at: null,
    },
    orderBy: { id: 'desc' },
  });
}

export async function listPosConnections(restaurantId?: number) {
  return prisma.partner_webhooks.findMany({
    where: restaurantId != null ? { restaurant_id: new Prisma.Decimal(restaurantId) } : undefined,
    orderBy: { id: 'desc' },
  });
}

export function connectionSupportsEvent(eventsCsvOrJson: string, event: string): boolean {
  try {
    const parsed = JSON.parse(eventsCsvOrJson) as string[];
    if (Array.isArray(parsed)) {
      return parsed.includes('*') || parsed.includes(event);
    }
  } catch {
    // fall through to CSV
  }
  const parts = eventsCsvOrJson.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.includes('*') || parts.includes(event);
}
