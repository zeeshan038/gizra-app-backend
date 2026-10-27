import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  adminCouponCreateSchema,
  adminCouponListQuerySchema,
  adminCouponStatusSchema,
  adminCouponUpdateSchema,
} from '../../schemas/admin/Coupon';
import {
  encodeCouponData,
  formatAdminCouponRow,
  normalizeDiscountType,
} from '../../utils/admin/coupons/formatAdminCoupon';
import {
  deleteCouponTranslations,
  upsertCouponTitleTranslations,
} from '../../utils/vendor/coupon/translations';

function adminCouponWhere(search?: string): Prisma.couponsWhereInput {
  const and: Prisma.couponsWhereInput[] = [{ created_by: 'admin' }];
  const tokens = search?.trim() ? search.trim().split(/\s+/).filter(Boolean) : [];
  if (tokens.length) {
    and.push({
      OR: tokens.flatMap((t) => [
        { title: { contains: t, mode: 'insensitive' } },
        { code: { contains: t, mode: 'insensitive' } },
      ]),
    });
  }
  return { AND: and };
}

type CouponBody = {
  titles: { default: string; en?: string; he?: string };
  code: string;
  coupon_type: string;
  zone_ids?: number[];
  restaurant_ids?: number[];
  customer_ids?: Array<number | 'all'>;
  limit?: number | null;
  start_date: Date;
  expire_date: Date;
  discount: number;
  discount_type: string;
  max_discount: number;
  min_purchase: number;
};

function buildCouponWriteData(body: CouponBody) {
  const limit =
    body.coupon_type === 'first_order'
      ? BigInt(1)
      : body.limit != null
        ? BigInt(body.limit)
        : null;

  const maxDiscount =
    body.discount_type === 'amount' || body.coupon_type === 'free_delivery' ? 0 : body.max_discount;

  return {
    title: body.titles.default,
    code: body.code,
    coupon_type: body.coupon_type,
    limit,
    start_date: body.start_date,
    expire_date: body.expire_date,
    min_purchase: body.min_purchase,
    max_discount: maxDiscount,
    discount: body.coupon_type === 'free_delivery' ? 0 : body.discount,
    discount_type:
      body.coupon_type === 'free_delivery' ? '' : normalizeDiscountType(body.discount_type),
    data: encodeCouponData(body.coupon_type, body.zone_ids, body.restaurant_ids),
    customer_id: JSON.stringify(body.customer_ids?.length ? body.customer_ids : ['all']),
    created_by: 'admin' as const,
  };
}

/**
 * @Route GET /api/admin/coupons/list
 */
export const listAdminCoupons = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCouponListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const { search, page, limit } = validated.value;
  const skip = (page - 1) * limit;
  const where = adminCouponWhere(search);

  try {
    const [rows, total] = await Promise.all([
      prisma.coupons.findMany({ where, orderBy: { id: 'desc' }, skip, take: limit }),
      prisma.coupons.count({ where }),
    ]);
    const data = await Promise.all(rows.map((r) => formatAdminCouponRow(r)));
    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: { data, total, page, limit },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'List failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/coupons/:id
 */
export const getAdminCoupon = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  try {
    const row = await prisma.coupons.findFirst({
      where: { id: BigInt(id), created_by: 'admin' },
    });
    if (!row) {
      return res.status(404).json({ status: false, msg: 'Coupon not found' });
    }
    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: await formatAdminCouponRow(row),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Fetch failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route POST /api/admin/coupons
 */
export const createAdminCoupon = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCouponCreateSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const body = validated.value as CouponBody;

  try {
    const duplicate = await prisma.coupons.findFirst({ where: { code: body.code } });
    if (duplicate) {
      return res.status(400).json({ status: false, msg: 'Coupon code already exists' });
    }

    const now = new Date();
    const created = await prisma.coupons.create({
      data: {
        ...buildCouponWriteData(body),
        status: true,
        created_at: now,
        updated_at: now,
      },
    });

    await upsertCouponTitleTranslations(created.id, body.titles);

    return res.status(201).json({
      status: true,
      msg: 'Coupon added successfully',
      data: await formatAdminCouponRow(created),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Create failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PUT /api/admin/coupons/:id
 */
export const updateAdminCoupon = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  const validated = adminCouponUpdateSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const body = validated.value as CouponBody;

  try {
    const existing = await prisma.coupons.findFirst({
      where: { id: BigInt(id), created_by: 'admin' },
    });
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Coupon not found' });
    }

    const codeTaken = await prisma.coupons.findFirst({
      where: { code: body.code, NOT: { id: BigInt(id) } },
    });
    if (codeTaken) {
      return res.status(400).json({ status: false, msg: 'Coupon code already exists' });
    }

    const updated = await prisma.coupons.update({
      where: { id: BigInt(id) },
      data: {
        ...buildCouponWriteData(body),
        updated_at: new Date(),
      },
    });

    await upsertCouponTitleTranslations(updated.id, body.titles);

    return res.status(200).json({
      status: true,
      msg: 'Coupon updated successfully',
      data: await formatAdminCouponRow(updated),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PATCH /api/admin/coupons/:id/status
 */
export const updateAdminCouponStatus = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  const validated = adminCouponStatusSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const existing = await prisma.coupons.findFirst({
      where: { id: BigInt(id), created_by: 'admin' },
    });
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Coupon not found' });
    }
    await prisma.coupons.update({
      where: { id: BigInt(id) },
      data: { status: validated.value.status, updated_at: new Date() },
    });
    return res.status(200).json({ status: true, msg: 'Coupon status updated' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route DELETE /api/admin/coupons/:id
 */
export const deleteAdminCoupon = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  try {
    const existing = await prisma.coupons.findFirst({
      where: { id: BigInt(id), created_by: 'admin' },
    });
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Coupon not found' });
    }
    await deleteCouponTranslations(existing.id);
    await prisma.coupons.delete({ where: { id: BigInt(id) } });
    return res.status(200).json({ status: true, msg: 'Coupon deleted successfully' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Delete failed';
    return res.status(500).json({ status: false, msg });
  }
};
