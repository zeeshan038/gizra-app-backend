import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { formatDeliveryManAdmin } from './formatDeliveryManAdmin';

export type ListDeliveryMenQuery = {
  search?: string;
  zone_id?: number | 'all';
  vehicle_id?: number | 'all';
  job_type?: 'all' | 'salary_base' | 'freelance';
  application_status: 'approved' | 'pending' | 'denied';
  page?: number;
  limit?: number;
};

function buildSearchWhere(search?: string): Prisma.delivery_menWhereInput | undefined {
  const tokens = search?.trim() ? search.trim().split(/\s+/).filter(Boolean) : [];
  if (!tokens.length) return undefined;
  return {
    OR: tokens.flatMap((t) => [
      { f_name: { contains: t, mode: 'insensitive' } },
      { l_name: { contains: t, mode: 'insensitive' } },
      { email: { contains: t, mode: 'insensitive' } },
      { phone: { contains: t, mode: 'insensitive' } },
      { identity_number: { contains: t, mode: 'insensitive' } },
    ]),
  };
}

export async function listDeliveryMenAdmin(query: ListDeliveryMenQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 15;
  const skip = (page - 1) * limit;

  const and: Prisma.delivery_menWhereInput[] = [
    { type: 'zone_wise' },
    { application_status: query.application_status },
  ];

  const searchWhere = buildSearchWhere(query.search);
  if (searchWhere) and.push(searchWhere);

  if (query.zone_id && query.zone_id !== 'all') {
    and.push({ zone_id: query.zone_id });
  }
  if (query.vehicle_id && query.vehicle_id !== 'all') {
    and.push({ vehicle_id: query.vehicle_id });
  }
  if (query.job_type === 'salary_base') {
    and.push({ earning: false });
  } else if (query.job_type === 'freelance') {
    and.push({ earning: true });
  }

  const where: Prisma.delivery_menWhereInput = { AND: and };

  const [rows, total] = await Promise.all([
    prisma.delivery_men.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take: limit,
    }),
    prisma.delivery_men.count({ where }),
  ]);

  const zoneIds = [...new Set(rows.map((r) => (r.zone_id != null ? Number(r.zone_id) : null)).filter(Boolean))] as number[];
  const zones =
    zoneIds.length > 0
      ? await prisma.zones.findMany({
          where: { id: { in: zoneIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true },
        })
      : [];
  const zoneMap = new Map(zones.map((z) => [Number(z.id), z.name]));

  return {
    data: rows.map((r) =>
      formatDeliveryManAdmin(r, r.zone_id != null ? zoneMap.get(Number(r.zone_id)) ?? null : null)
    ),
    total,
    page,
    limit,
  };
}
