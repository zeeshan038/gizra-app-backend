import prisma from '../../config/database';
import { publicMediaUrl } from '../mediaStorage';

export function parseDmReviewAttachments(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => publicMediaUrl(String(p)) ?? String(p));
  } catch {
    return [];
  }
}

export function formatDmReviewRow(
  row: {
    id: bigint;
    delivery_man_id: { toString(): string } | number | bigint;
    user_id: { toString(): string } | number | bigint;
    order_id: { toString(): string } | number | bigint;
    comment: string | null;
    rating: bigint;
    attachment: string | null;
    created_at: Date | null;
    updated_at: Date | null;
    status: boolean | null;
  },
  customer?: { f_name: string | null; l_name: string | null; image: string | null } | null
) {
  return {
    id: Number(row.id),
    delivery_man_id: Number(row.delivery_man_id),
    user_id: Number(row.user_id),
    order_id: Number(row.order_id),
    comment: row.comment,
    rating: Number(row.rating),
    attachment: parseDmReviewAttachments(row.attachment),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    customer: customer
      ? {
          f_name: customer.f_name,
          l_name: customer.l_name,
          image: publicMediaUrl(customer.image) ?? customer.image,
        }
      : null,
  };
}

export async function loadDeliveryManReviews(deliveryManId: number) {
  const dm = await prisma.delivery_men.findUnique({
    where: { id: BigInt(deliveryManId) },
    select: { id: true },
  });
  if (!dm) return null;

  const rows = await prisma.d_m_reviews.findMany({
    where: { delivery_man_id: deliveryManId, status: true },
    orderBy: { id: 'desc' },
  });

  const userIds = [...new Set(rows.map((r) => Number(r.user_id)))];
  const users =
    userIds.length > 0
      ? await prisma.users.findMany({
          where: { id: { in: userIds.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true, image: true },
        })
      : [];
  const userById = new Map(users.map((u) => [Number(u.id), u]));

  const reviews = rows.map((r) =>
    formatDmReviewRow(r, userById.get(Number(r.user_id)) ?? null)
  );

  let avg_rating = 0;
  if (rows.length) {
    const sum = rows.reduce((acc, r) => acc + Number(r.rating), 0);
    avg_rating = Math.round((sum / rows.length) * 100) / 100;
  }

  return { avg_rating, review_count: rows.length, reviews };
}

export async function computeDeliveryManAvgRating(deliveryManId: number): Promise<number> {
  const rows = await prisma.d_m_reviews.findMany({
    where: { delivery_man_id: deliveryManId },
    select: { rating: true },
  });
  if (!rows.length) return 0;
  const sum = rows.reduce((acc, r) => acc + Number(r.rating), 0);
  return Math.round((sum / rows.length) * 100) / 100;
}

export async function submitDeliveryManReview(params: {
  userId: number;
  delivery_man_id: number;
  order_id: number;
  comment: string;
  rating: number;
  attachment?: string[] | string;
}) {
  const dm = await prisma.delivery_men.findUnique({
    where: { id: BigInt(params.delivery_man_id) },
    select: { id: true },
  });
  if (!dm) {
    return { ok: false as const, httpStatus: 403, code: 'delivery_man_id', message: 'Not found' };
  }

  const existing = await prisma.d_m_reviews.findFirst({
    where: {
      delivery_man_id: params.delivery_man_id,
      user_id: params.userId,
      order_id: params.order_id,
    },
  });
  if (existing) {
    return {
      ok: false as const,
      httpStatus: 403,
      code: 'review',
      message: 'Already submitted',
    };
  }

  let attachmentJson: string | null = null;
  if (params.attachment) {
    const list = Array.isArray(params.attachment) ? params.attachment : [params.attachment];
    attachmentJson = JSON.stringify(list.filter(Boolean));
  }

  await prisma.d_m_reviews.create({
    data: {
      delivery_man_id: params.delivery_man_id,
      user_id: params.userId,
      order_id: params.order_id,
      comment: params.comment,
      rating: BigInt(Math.round(params.rating)),
      attachment: attachmentJson,
      status: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  return { ok: true as const };
}
