import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';

export type DetailListQuery = {
  search?: string;
  entity_id?: number | 'all';
  payment_method_id?: number | 'all';
  page: number;
  limit: number;
};

function parseMethodFields(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch {
    return null;
  }
}

export async function listRestaurantDisbursementDetails(
  disbursementId: number,
  query: DetailListQuery
) {
  const and: Prisma.disbursement_detailsWhereInput[] = [
    { disbursement_id: disbursementId },
    { restaurant_id: { not: null } },
  ];

  if (query.entity_id && query.entity_id !== 'all') {
    and.push({ restaurant_id: query.entity_id });
  }

  if (query.payment_method_id && query.payment_method_id !== 'all') {
    const methods = await prisma.disbursement_withdrawal_methods.findMany({
      where: { withdrawal_method_id: query.payment_method_id },
      select: { id: true },
    });
    const ids = methods.map((m) => Number(m.id));
    and.push({ payment_method: { in: ids.length ? ids : [-1] } });
  }

  const tokens = query.search?.trim() ? query.search.trim().split(/\s+/).filter(Boolean) : [];
  if (tokens.length) {
    const vendorMatches = await prisma.vendors.findMany({
      where: {
        OR: tokens.flatMap((t) => [
          { f_name: { contains: t, mode: 'insensitive' } },
          { l_name: { contains: t, mode: 'insensitive' } },
          { email: { contains: t, mode: 'insensitive' } },
          { phone: { contains: t, mode: 'insensitive' } },
        ]),
      },
      select: { id: true },
    });
    const vendorIds = vendorMatches.map((v) => Number(v.id));
    const restOr: Prisma.restaurantsWhereInput[] = tokens.flatMap((t) => [
      { name: { contains: t, mode: 'insensitive' as const } },
      { email: { contains: t, mode: 'insensitive' as const } },
      { phone: { contains: t, mode: 'insensitive' as const } },
    ]);
    if (vendorIds.length) restOr.push({ vendor_id: { in: vendorIds } });
    const restaurants = await prisma.restaurants.findMany({
      where: { OR: restOr },
      select: { id: true },
    });
    const restIds = restaurants.map((r) => Number(r.id));
    and.push({ restaurant_id: { in: restIds.length ? restIds : [-1] } });
  }

  const where: Prisma.disbursement_detailsWhereInput = { AND: and };
  const skip = (query.page - 1) * query.limit;

  const [rows, total] = await Promise.all([
    prisma.disbursement_details.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.disbursement_details.count({ where }),
  ]);

  const data = await formatDetailRows(rows, 'restaurant');
  return { data, total };
}

export async function listDmDisbursementDetails(disbursementId: number, query: DetailListQuery) {
  const and: Prisma.disbursement_detailsWhereInput[] = [
    { disbursement_id: disbursementId },
    { delivery_man_id: { not: null } },
  ];

  if (query.entity_id && query.entity_id !== 'all') {
    and.push({ delivery_man_id: query.entity_id });
  }

  if (query.payment_method_id && query.payment_method_id !== 'all') {
    const methods = await prisma.disbursement_withdrawal_methods.findMany({
      where: { withdrawal_method_id: query.payment_method_id },
      select: { id: true },
    });
    const ids = methods.map((m) => Number(m.id));
    and.push({ payment_method: { in: ids.length ? ids : [-1] } });
  }

  const tokens = query.search?.trim() ? query.search.trim().split(/\s+/).filter(Boolean) : [];
  if (tokens.length) {
    const dms = await prisma.delivery_men.findMany({
      where: {
        OR: tokens.flatMap((t) => [
          { f_name: { contains: t, mode: 'insensitive' } },
          { l_name: { contains: t, mode: 'insensitive' } },
          { email: { contains: t, mode: 'insensitive' } },
          { phone: { contains: t, mode: 'insensitive' } },
        ]),
      },
      select: { id: true },
    });
    and.push({
      delivery_man_id: { in: dms.length ? dms.map((d) => Number(d.id)) : [-1] },
    });
  }

  const where: Prisma.disbursement_detailsWhereInput = { AND: and };
  const skip = (query.page - 1) * query.limit;

  const [rows, total] = await Promise.all([
    prisma.disbursement_details.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.disbursement_details.count({ where }),
  ]);

  const data = await formatDetailRows(rows, 'delivery_man');
  return { data, total };
}

async function formatDetailRows(
  rows: Awaited<ReturnType<typeof prisma.disbursement_details.findMany>>,
  kind: 'restaurant' | 'delivery_man'
) {
  const methodIds = [...new Set(rows.map((r) => Number(r.payment_method)))];
  const methods =
    methodIds.length > 0
      ? await prisma.disbursement_withdrawal_methods.findMany({
          where: { id: { in: methodIds.map((id) => BigInt(id)) } },
        })
      : [];
  const methodMap = new Map(methods.map((m) => [Number(m.id), m]));

  if (kind === 'restaurant') {
    const restIds = [
      ...new Set(
        rows.map((r) => (r.restaurant_id != null ? Number(r.restaurant_id) : null)).filter(Boolean)
      ),
    ] as number[];
    const restaurants =
      restIds.length > 0
        ? await prisma.restaurants.findMany({
            where: { id: { in: restIds.map((id) => BigInt(id)) } },
            select: { id: true, name: true, phone: true, email: true },
          })
        : [];
    const restMap = new Map(restaurants.map((r) => [Number(r.id), r]));

    return rows.map((r) => {
      const rest = r.restaurant_id != null ? restMap.get(Number(r.restaurant_id)) : undefined;
      const method = methodMap.get(Number(r.payment_method));
      return {
        id: Number(r.id),
        disbursement_id: Number(r.disbursement_id),
        restaurant_id: r.restaurant_id != null ? Number(r.restaurant_id) : null,
        delivery_man_id: null,
        name: rest?.name ?? '—',
        phone: rest?.phone ?? null,
        email: rest?.email ?? null,
        disbursement_amount: r.disbursement_amount,
        payment_method_name: method?.method_name ?? 'Default method',
        method_fields: parseMethodFields(method?.method_fields ?? null),
        status: r.status,
        created_at: r.created_at,
      };
    });
  }

  const dmIds = [
    ...new Set(
      rows.map((r) => (r.delivery_man_id != null ? Number(r.delivery_man_id) : null)).filter(Boolean)
    ),
  ] as number[];
  const dms =
    dmIds.length > 0
      ? await prisma.delivery_men.findMany({
          where: { id: { in: dmIds.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true, phone: true, email: true },
        })
      : [];
  const dmMap = new Map(dms.map((d) => [Number(d.id), d]));

  return rows.map((r) => {
    const dm = r.delivery_man_id != null ? dmMap.get(Number(r.delivery_man_id)) : undefined;
    const method = methodMap.get(Number(r.payment_method));
    return {
      id: Number(r.id),
      disbursement_id: Number(r.disbursement_id),
      restaurant_id: null,
      delivery_man_id: r.delivery_man_id != null ? Number(r.delivery_man_id) : null,
      name: dm ? [dm.f_name, dm.l_name].filter(Boolean).join(' ') : '—',
      phone: dm?.phone ?? null,
      email: dm?.email ?? null,
      disbursement_amount: r.disbursement_amount,
      payment_method_name: method?.method_name ?? 'Default method',
      method_fields: parseMethodFields(method?.method_fields ?? null),
      status: r.status,
      created_at: r.created_at,
    };
  });
}
