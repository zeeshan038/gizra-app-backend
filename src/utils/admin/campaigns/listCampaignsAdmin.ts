import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { formatBasicCampaignRow, formatFoodCampaignRow } from './formatCampaignAdmin';

export async function listBasicCampaignsAdmin(query: {
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const and: Prisma.campaignsWhereInput[] = [];
  if (query.search?.trim()) {
    const tokens = query.search.trim().split(/\s+/).filter(Boolean);
    and.push({
      OR: tokens.map((t) => ({ title: { contains: t, mode: 'insensitive' } })),
    });
  }
  const where = and.length ? { AND: and } : {};
  const [total, rows] = await Promise.all([
    prisma.campaigns.count({ where }),
    prisma.campaigns.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return {
    data: rows.map(formatBasicCampaignRow),
    total,
    page,
    limit,
  };
}

export async function listFoodCampaignsAdmin(query: {
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const and: Prisma.item_campaignsWhereInput[] = [];
  if (query.search?.trim()) {
    const tokens = query.search.trim().split(/\s+/).filter(Boolean);
    and.push({
      OR: tokens.map((t) => ({ title: { contains: t, mode: 'insensitive' } })),
    });
  }
  const where = and.length ? { AND: and } : {};
  const [total, rows] = await Promise.all([
    prisma.item_campaigns.count({ where }),
    prisma.item_campaigns.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return {
    data: rows.map(formatFoodCampaignRow),
    total,
    page,
    limit,
  };
}
